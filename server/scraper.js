'use strict';

const cheerio = require('cheerio');
const request = require('request');

// helper functions ---------------

/**
 * Scrapes given link looking for info on a specific game
 * @param {string} html The url to scrape
 * @returns {array} An array of objects containing game names, AppIDs, and links to their pages
 */
const buildGamesObjArray = (html) => {
  const $ = cheerio.load(html);
  const names = $('.search_name');
  const data = [];
  names.each((i, e) => {
    let gameName, appID, link;
    if (e.children[1].children[0].data) gameName = e.children[1].children[0].data;
    if (e.parent.parent.attribs.href) {
      link = e.parent.parent.attribs.href;
      appID = link.slice((link.indexOf('app/') + 4));
      appID = appID.slice(0, link.indexOf('/'));
    }
    if (link && gameName && appID) data.push({ gameName, appID, link });
  });
  return data;
};

/**
 * Makes AJAX request for the top sellers for a given tag from steam API
 * @param {string} url the Steam API URL to hit
 * @param {string} tag The tag to be used as reference in our data (not required by the API)
 * @param {object} res Express response object
 * @returns A promise which adds an array of game objects to res.locals.topSellers on fulfillment
 */
const buildGamesRequestPromise = (url, tag, res) => {
  return new Promise((resolve, reject) => {
    request(url, (error, response, html) => {
      if (error) reject(error);
      res.locals.topSellers[tag] = buildGamesObjArray(html);
      resolve();
    });
  });
};

/**
 * Punctuates a price integer (e.g. '999' to $9.99)
 * @param {number} num A non-formatted amount
 * @param {string} currency A currency, e.g., USD, GBP etc
 */
const formatPrice = (num, currency, discount) => {
  if (typeof num !== 'number') return 'Could not determine price.';
  let str = String(num).split('');
  str.splice(-2, 0, '.');
  str = `$${str.join('')}`;
  str = currency === 'USD' ? str : `${str} (${currency})`;
  return discount > 0 ? `${str} -- on sale at ${discount}% off!` : str;
};

/**
 * Searches res.locals.topSellers for a specific Steam appID, required for Steam API
 * @param {string} targetGame The name of the target game
 * @param {object} topSellers The topSellers object from res.locals
 * @returns {string} The Steam appID
 */
const findAppID = (targetGame, topSellers) => {
  console.log(`Helper (findAppID): Finding appID for ${targetGame}...\n`);
  const topSellersKeys = Object.keys(topSellers);
  for (let k = 0; k < topSellersKeys.length; k += 1) {
    const cat = topSellersKeys[k];
    for (let i = 0; i < topSellers[cat].length; i += 1) {
      if (topSellers[cat][i].gameName === targetGame) {
        return topSellers[cat][i].appID;
      }
    }
  }
};

// Middleware -------------------------

const scraperController = {

  /** Creates and stores master game list in res.locals by building and invoking scrapers */
  createTopSellersObj: (req, res, next) => {
    res.locals.topSellers = {};
    console.log('Controller (getData): Building scrapers...\n');
    const requestPromises = [
      buildGamesRequestPromise('https://store.steampowered.com/search/?filter=topsellers', 'all', res),
      buildGamesRequestPromise('https://store.steampowered.com/search/?tags=9&filter=topsellers', 'strategy', res),
      buildGamesRequestPromise('https://store.steampowered.com/search/?tags=122&filter=topsellers', 'rpg', res),
    ];
    const launchPromisesTime = Date.now();
    console.log('Controller (getData): Scrapers launched. Awaiting AJAX resolutions...\n');
    Promise.all(requestPromises).then(() => {
      console.log('Controller (getData): All promised AJAX requests resolved after', Date.now() - launchPromisesTime, 'ms.\n');
      next();
    }).catch(error => next(error));
  },

  /** Pretty much useless func for logging request params to terminal */
  logParams: (req, res, next) => {
    console.log('Controller (extractParams): ***REQUEST RECEIVED***\n');
    if (req.params.targetGame === 'all') console.log('Controller (extractParams): Client requested master list.\n');
    else console.log(`Controller (extractParams): Client requested data for game "${req.params.targetGame}".\n`);
    next();
  },

  /** Continue or end response based on params. Sends response if route parameter was 'all' */
  sendIfClientWantsAll: (req, res, next) => {
    if (req.params.targetGame !== 'all') {
      console.log('Controller (sendIfClientWantsAll): Client wants specific game data...\n');
      next();
    } else {
      console.log('Controller (sendIfClientWantsAll): Returning master list to client.\n');
      res.json(res.locals.topSellers);
    }
  },

  /** Calls helper function to find Steam AppID with Express error handling */
  getSteamAppID: (req, res, next) => {
    const appID = findAppID(req.params.targetGame, res.locals.topSellers);
    if (!appID) return next(`Could not find an appID for ${req.params.targetGame}`);
    res.locals.appID = appID;
    next();
  },

  /**
   * Accesses Steam API for all data on game and adds it to res.locals.targetGameData
   * Requires targetGame string and topSellers object to be in res.locals.
   */
  collectTargetData: (req, res, next) => {
    const { appID } = res.locals;
    const appId = res.locals.appID;
    console.log(`Controller (collectTargetData): Querying Steam API for appID ${appID}...\n`);
    const timeStart = Date.now();
    // hit steam API
    request(`https://store.steampowered.com/api/appdetails?appids=${appID}`, (error, response) => {
      if (error) {
        return next(error);
      }
      console.log(`Controller (collectTargetData): Received response from Steam API after ${Date.now() - timeStart}ms.\n`);
      res.locals.targetGameData = JSON.parse(response.body)[appID];
      next();
    });
  },

  /** Builds object of data about a specific game to return to client, stores in res.locals.desiredData */
  extractRelevantData: (req, res, next) => {
    const gameData = {};
    const { name, genres, metacritic, short_description, price_overview, pc_requirements, platforms, screenshots } = res.locals.targetGameData.data;
    gameData.name = name;
    gameData.genres = genres.map(e => e.description);
    gameData.score = metacritic ? metacritic.score : 'No score available.';
    gameData.desc = short_description;
    gameData.price = formatPrice(
      price_overview.final,
      price_overview.currency,
      price_overview.discount_percent,
    );
    gameData.pcreqs = pc_requirements.minimum;
    gameData.mac = platforms.mac;
    gameData.imgURLs = screenshots.map(e => e.path_thumbnail);
    console.log('Controller (extractRelevantData): Game data object built.');
    res.locals.desiredData = gameData;
    next();
  },
};

module.exports = scraperController;
