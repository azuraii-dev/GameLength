const cheerio =  require('cheerio')
const express = require('express')
const axios = require('axios')
const qs = require('qs')
const app = express()
const port = 3000

app.get('/', async(req, res) => {

    const query = req.query.query || null;

    const result = await searchQuery(query)
    console.log(result)
    res.json(result)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })


async function searchQuery(query) {
    const res = await axios.post('https://howlongtobeat.com/search_results?page=1', 
    
        qs.stringify({
            queryString: query,
            t: 'games',
            sorthead: 'popular',
            sortd: 0,
            length_type: 'main',
            randomize: 0,
        }),
        {
        headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/x-www-form-urlencoded",
            "sec-ch-ua": "\"Opera GX\";v=\"89\", \"Chromium\";v=\"103\", \"_Not:A-Brand\";v=\"24\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "cookie": "PHPSESSID=7otf4acloukgthr6pcdq4pbs38",
            "Referer": "https://howlongtobeat.com/",
            "Referrer-Policy": "strict-origin-when-cross-origin",
        }      
        } 
    )

    try {
        const $ = cheerio.load(res.data)
        const url = $('ul li').first().find('.shadow_text a').attr('href')
        const gameLength = await getGameTime(`https://howlongtobeat.com/${url}`)

        return gameLength

    } catch (error) {

        return {error: 'Unable to fetch game data'}
    }

}

async function getGameTime(url) {
    const res = await axios.get(url)

    try {
        const $ = cheerio.load(res.data)

        const gameTitle = $('.profile_header').text().trim()

        const gameLength = $('.game_main_table > tbody > tr > td:nth-child(3)').first().text().trim()

        const steamUrl = $('.text_red')?.attr('href') || false;

        const appId = !steamUrl ? 0 : steamUrl.slice(0, -1).split('/').at(-1)

        return {success: true, title: gameTitle, gameLength: gameLength, appId: appId}
    
    } catch (error) {
        
        return {error: 'Unable to fetch game data'}
    }

}


