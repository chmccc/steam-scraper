'use strict';

const cheerio = require('cheerio');
const request = require('request');

// helper functions ---------------

// scraper
const buildGamesObjArray = (html) => {
  const $ = cheerio.load(html);
  const names = $('.search_name');
  const data = [];
  names.each((i, e) => {
    let gameName, appID, link;
    if (e.children[1].children[0].data) gameName = e.children[1].children[0].data;
    if (e.parent.parent.attribs.href) link = e.parent.parent.attribs.href;
    if (link) {
      appID = link.slice((link.indexOf('app/') + 4));
      appID = appID.slice(0, link.indexOf('/'));
    }
    if (link && gameName && appID) data[gameName] = data.push({ gameName, appID, link });
  });
  return data.filter(e => typeof e === 'object');
};

// builds scrapers
const buildGamesRequestPromise = (url, tag, res) => {
  return new Promise((resolve, reject) => {
    request(url, (error, response, html) => {
      if (error) reject(error);
      res.locals.topSellers[tag] = buildGamesObjArray(html);
      resolve();
    });
  });
};

// punctuates price integer (e.g. '999' to $9.99)
const getPrice = (num, currency, discount) => {
  let str = String(num).split('');
  str.splice(-2, 0, '.');
  str = `$${str.join('')}`;
  str = currency === 'USD' ? str : `${str} (${currency})`;
  return discount > 0 ? `${str} -- on sale at ${discount}% off!` : str;
};

// searches scraped game data for a Steam appID, required for Steam API
const findAppID = (req, res) => {
  console.log(`Helper (findAppID): Finding appID for ${req.params.targetGame}...\n`);
  for (let k in res.locals.topSellers) {
    let cat = res.locals.topSellers[k];
    for (let i = 0; i < cat.length; i++) {
      if (cat[i].gameName === req.params.targetGame) {
        return cat[i].appID;
      }
    }
  }
  throw new Error('Helper (findAppId): Invalid target game or game not found.');
};

// Middleware -------------------------

const scraperController = {
  // creates and stores master game list by building and invoking scrapers
  createTopSellersObj: (req, res, next) => {
    res.locals.topSellers = {};
    const buildPromisesTime = Date.now();
    console.log('Controller (getData): Building scrapers...\n');
    const requestProms = [
      buildGamesRequestPromise('https://store.steampowered.com/search/?filter=topsellers', 'all', res),
      buildGamesRequestPromise('https://store.steampowered.com/search/?tags=9&filter=topsellers', 'strategy', res),
      buildGamesRequestPromise('https://store.steampowered.com/search/?tags=122&filter=topsellers', 'rpg', res),
    ];
    const launchPromisesTime = Date.now();
    console.log('Controller (getData): Scrapers launched. Awaiting AJAX resolutions...\n');
    Promise.all(requestProms).then(() => {
      console.log('Controller (getData): All promised AJAX requests resolved after', Date.now() - launchPromisesTime, 'ms.\n');
      // console.log(Here are some sample results:\n',
      // 'ALL #1: ', res.locals.topSellers.all[0], '\n',
      // 'STRATEGY #1: ', res.locals.topSellers.strategy[0], '\n',
      // 'RPG #1: ', res.locals.topSellers.rpg[0], '\n',
      // );
      next();
    });
  },

  // pretty much useless func for logging params to terminal
  declareParams: (req, res, next) => {
    console.log('Controller (extractParams): ***REQUEST RECEIVED***\n');
    if (req.params.targetGame === 'all') console.log('Controller (extractParams): Client requested master list.\n');
    else console.log(`Controller (extractParams): Client requested data for game "${req.params.targetGame}".\n`);
    next();
  },

  // route or resolve request based on query
  filterSwitch: (req, res, next) => {
    if (req.params.targetGame !== 'all') {
      console.log(`Controller (filterSwitch): Filtering for ${req.params.targetGame}`);
      next();
    } else {
      console.log('Controller (filterSwitch): Returning master list to client.');
      res.json(res.locals.topSellers);
    }
  },

  // access Steam API for all data on game
  collectTargetData: (req, res, next) => {
    const appID = findAppID(req, res);
    console.log(`Controller (collectTargetData): Querying Steam API for appID ${appID}...\n`);
    const timeStart = Date.now();
    request(`https://store.steampowered.com/api/appdetails?appids=${appID}`, (error, response, html) => {
      if (error) throw new Error(error);
      console.log(`Controller (collectTargetData): Received response from Steam API after ${Date.now() - timeStart}ms.\n`);
      res.locals.targetGameData = JSON.parse(response.body)[appID];
      next();
    });
  },

  // build object of only wanted data to return to client
  extractRelevantData: (req, res) => {
    const gameData = {};
    const raw = res.locals.targetGameData.data;
    gameData.name = raw.name;
    gameData.genres = raw.genres.map(e => e.description);
    gameData.score = raw.metacritic.score;
    gameData.desc = raw.short_description;
    gameData.price = getPrice(raw.price_overview.final, raw.price_overview.currency, raw.price_overview.discount_percent);
    gameData.pcreqs = raw.pc_requirements.minimum;
    gameData.mac = raw.platforms.mac;
    gameData.imgURLs = raw.screenshots.map(e => e.path_thumbnail);
    console.log('Controller (extractRelevantData): Game data object built. Returning to client.\n');
    res.json(gameData);
  },
};

module.exports = scraperController;
