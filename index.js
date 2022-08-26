const cheerio =  require('cheerio')
const express = require('express')
const axios = require('axios')
const qs = require('qs')
const redis = require('redis')

require('dotenv').config()

const app = express()
const PORT = process.env.PORT
const NODE_ENV = process.env.NODE_ENV
let REDIS_ENABLED = NODE_ENV == "production";

let redisClient = null;

(async () => {

    if (REDIS_ENABLED) {

        redisClient = redis.createClient();
    
        redisClient.on('error', function(err) {
            console.log('Redis Client Error', err)
            REDIS_ENABLED = false;
        });

        redisClient.on('connect', function() {
            console.log('Redis Client Connected')

            redisClient.flushall('ASYNC', function() {
                console.log("Flushed DB")
            });
        });
    
        await redisClient.connect();
    }

})();

const ERRORS = {
    fetchError: {error: 'Unable to fetch game data'},
    connectionError: {error: 'Unable to connect to the server'}
}

app.get('/', async(req, res) => {
    res.json({
        usage: '/game/{game name}',
        description: 'Simple API to fetch average game length by game name.',
        credits: {game_data: 'https://howlongtobeat.com', steamdeck_plugin_source: '@joamjoamjoam'},
        author: '@azuraii',
    })
})

app.get('/game/:query', cache, async(req, res) => {
    const query = req.params.query;

    result = await searchQuery(query)

    if (result.error) {
        res.status(404)
    } else {
        res.json(result)
    }

    res.end()
})

app.get('*', async(req, res) => {
    res.redirect('/')
    res.end()
})

app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`)
    console.log(`Environment set to ${NODE_ENV}`)
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
        const gameData = await getGameTime(`https://howlongtobeat.com/${url}`)

        await cacheData(query, gameData)

        return gameData

    } catch (error) {

        return ERRORS.fetchError
    }

}

async function getGameTime(url) {
    
    const res = await axios.get(url)

    try {
        const $ = cheerio.load(res.data)

        const gameTitle = $('.profile_header').text().trim()

        const gameLength = $('.game_main_table > tbody > tr > td:nth-child(3)')?.first().text().trim() || "-"

        const steamUrl = $('.text_red')?.attr('href') || false;

        const appId = !steamUrl ? 0 : steamUrl.slice(0, -1).split('/').at(-1)

        const result = {success: true, title: gameTitle, gameLength: gameLength, appId: appId}

        return result
    
    } catch (error) {
        
        return ERRORS.fetchError
    }

}

async function cache(req, res, next) {
    const query = req.params.query

    if (!query) {
        res.json(ERRORS.fetchError);
        res.end();
        return;
    }

    if (!REDIS_ENABLED) next();

    try {
        const cachedResult = await redisClient.get(query);

        if (cachedResult) {
            console.log(query, "from cache")
            res.json(JSON.parse(cachedResult));
            res.end()
            return;
        }

        next()
    } catch (err) {
        console.log(err)
        next()
    }


}

async function cacheData(query, data) {
    if (!REDIS_ENABLED) return;

    await redisClient.set(query, JSON.stringify(data), {
        EX: 3600,
        NX: true,
    });

    console.log(query, "cached")
}


