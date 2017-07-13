let renovateDepType = (() => {
  var _ref = _asyncToGenerator(function* (packageContent, config) {
    logger = config.logger || logger;
    logger.trace({ config }, `renovateDepType(packageContent, config)`);
    if (config.enabled === false) {
      logger.debug('depType is disabled');
      return [];
    }
    // Extract all dependencies from the package.json
    const currentDeps = yield packageJson.extractDependencies(packageContent, config.depType);
    if (currentDeps.length === 0) {
      return [];
    }
    logger.debug(`currentDeps=${JSON.stringify(currentDeps)}`);
    // Filter out ignored dependencies
    const filteredDeps = currentDeps.filter(function (dependency) {
      return config.ignoreDeps.indexOf(dependency.depName) === -1;
    });
    logger.debug(`filteredDeps=${JSON.stringify(filteredDeps)}`);
    // Obtain full config for each dependency
    const depConfigs = filteredDeps.map(function (dep) {
      return module.exports.getDepConfig(config, dep);
    });
    logger.trace({ config: depConfigs }, `depConfigs`);
    // renovateDepType can return more than one upgrade each
    const pkgWorkers = depConfigs.map(function (depConfig) {
      return pkgWorker.renovatePackage(depConfig);
    });
    // Use Promise.all to execute npm queries in parallel
    const allUpgrades = yield Promise.all(pkgWorkers);
    logger.trace({ config: allUpgrades }, `allUpgrades`);
    // Squash arrays into one
    const combinedUpgrades = [].concat(...allUpgrades);
    logger.trace({ config: combinedUpgrades }, `combinedUpgrades`);
    return combinedUpgrades;
  });

  return function renovateDepType(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const configParser = require('../../config');
const pkgWorker = require('../package');
const packageJson = require('./package-json');
let logger = require('../../logger');

module.exports = {
  renovateDepType,
  getDepConfig
};

function getDepConfig(depTypeConfig, dep) {
  const depConfig = configParser.mergeChildConfig(depTypeConfig, dep);
  // Apply any matching package rules
  if (depConfig.packages) {
    let packageRuleApplied = false;
    depConfig.packages.forEach(packageConfig => {
      // Apply at most 1 package fule
      if (!packageRuleApplied) {
        const pattern = packageConfig.packagePattern || `^${packageConfig.packageName}$`;
        const packageRegex = new RegExp(pattern);
        if (depConfig.depName.match(packageRegex)) {
          packageRuleApplied = true;
          // Package rule config overrides any existing config
          Object.assign(depConfig, packageConfig);
          delete depConfig.packageName;
          delete depConfig.packagePattern;
        }
      }
    });
  }
  depConfig.logger = logger.child({
    repository: depConfig.repository,
    packageFile: depConfig.packageFile,
    depType: depConfig.depType,
    dependency: depConfig.depName
  });
  return configParser.filterConfig(depConfig, 'package');
}