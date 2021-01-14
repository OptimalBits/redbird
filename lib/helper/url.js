const { URL } = require('url');

/** @type {(url: string) => URL} */
const parseUrl = (url) => new URL(url, 'http://xxx');

module.exports = {
  parseUrl,
};
