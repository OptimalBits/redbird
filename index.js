/*eslint-env node */
'use strict';
module.exports = require('./lib/proxy');
module.exports.docker = require('./lib/docker');
module.exports.etcd = require('./lib/etcd-backend');
