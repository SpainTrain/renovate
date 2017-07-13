

// Returns all results for a given dependency config
let renovatePackage = (() => {
  var _ref = _asyncToGenerator(function* (config) {
    logger = config.logger || logger;
    if (config.enabled === false) {
      logger.debug('package is disabled');
      return [];
    }
    let results = [];
    const npmDep = yield npmApi.getDependency(config.depName, logger);
    if (npmDep) {
      results = yield versions.determineUpgrades(npmDep, config);
      if (results.length > 0) {
        logger.info({ dependency: config.depName }, `${results.length} result(s): ${results.map(function (upgrade) {
          return upgrade.newVersion;
        })}`);
      }
    } else {
      // If dependency lookup fails then warn and return
      const result = {
        type: 'error',
        message: 'Failed to look up dependency'
      };
      logger.warn(result.message);
      results = [result];
    }
    logger.debug(`${config.depName} results: ${JSON.stringify(results)}`);
    // Flatten the result on top of config, add repositoryUrl
    return results.map(function (result) {
      const upg = configParser.mergeChildConfig(config, result);
      upg.repositoryUrl = npmDep ? npmDep.repositoryUrl : '';
      return configParser.filterConfig(upg, 'branch');
    });
  });

  return function renovatePackage(_x) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const npmApi = require('../../api/npm');
const versions = require('./versions');
const configParser = require('../../config');

let logger = require('../../logger');

module.exports = {
  renovatePackage
};