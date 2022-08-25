const cheerio =  require('cheerio')
const express = require('express')
const axios = require('axios')
const qs = require('qs')
const redis = require('redis')

require('dotenv').config()

const app = express()
const PORT = process.env.PORT
const NODE_ENV = process.env.NODE_ENV
const REDIS_ENABLED = NODE_ENV == "production";

let redisClient = null;

async() => {
    if (REDIS_ENABLED) {
        redisClient = redis.createClient();
    
        redisClient.on('error', function(err) {
            console.log('Redis Client Error', err)
        });

        redisClient.on('connect', function(err) {
            console.log('Redis Client Connected', err)
        });
    
        await redisClient.connect("redis://:2rI51FLJ8bD#Rh%jA@127.0.0.1:6379");
    }
}

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

app.get('/game/:query', async(req, res) => {
    const query = req.params.query || null;

    const result = await searchQuery(query)

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

    if (query == null) return ERRORS.fetchError;

    const cachedResult = await fetchCachedGame(query);

    if (cachedResult) {
        return cachedResult
    }

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

        await cacheGame(query, gameData)

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

        const gameLength = $('.game_main_table > tbody > tr > td:nth-child(3)').first().text().trim()

        const steamUrl = $('.text_red')?.attr('href') || false;

        const appId = !steamUrl ? 0 : steamUrl.slice(0, -1).split('/').at(-1)

        const result = {success: true, title: gameTitle, gameLength: gameLength, appId: appId}

        return result
    
    } catch (error) {
        
        return ERRORS.fetchError
    }

}

async function cacheGame(game, data) {
    if (!REDIS_ENABLED) return;

    await redisClient.set(game, JSON.stringify(data), {
        EX: 3600,
        NX: true,
    });

    console.log(game, "cached")
}

async function fetchCachedGame(game) {

    if (!REDIS_ENABLED) return false;

    try {
        const cachedResult = await redisClient.get(game);

        if (cachedResult) {
            console.log(game, "from cache")
            return JSON.parse(cachedResult);
        }
        return false

    } catch (err) {
        console.log(err)
    }
}


