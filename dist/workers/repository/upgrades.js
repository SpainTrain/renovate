let determineRepoUpgrades = (() => {
  var _ref = _asyncToGenerator(function* (config) {
    config.logger.trace({ config }, 'determineRepoUpgrades');
    if (config.packageFiles.length === 0) {
      config.logger.warn('No package files found');
    }
    let upgrades = [];
    // Iterate through repositories sequentially
    for (let index = 0; index < config.packageFiles.length; index += 1) {
      const packageFileConfig = module.exports.getPackageFileConfig(config, index);
      upgrades = upgrades.concat((yield packageFileWorker.renovatePackageFile(packageFileConfig)));
    }
    return upgrades;
  });

  return function determineRepoUpgrades(_x) {
    return _ref.apply(this, arguments);
  };
})();

let branchifyUpgrades = (() => {
  var _ref2 = _asyncToGenerator(function* (upgrades, parentLogger) {
    logger = parentLogger || logger;
    logger.debug('branchifyUpgrades');
    logger.trace({ config: upgrades }, 'branchifyUpgrades');
    const branchConfigs = [];
    const res = module.exports.groupByBranch(upgrades);
    for (const branchName of Object.keys(res.branchUpgrades)) {
      logger = logger.child({ branch: branchName });
      const branchUpgrades = res.branchUpgrades[branchName];
      const branchConfig = module.exports.generateConfig(branchUpgrades);
      branchConfig.branchName = branchName;
      branchConfig.logger = logger;
      branchConfigs.push(branchConfig);
    }
    return {
      errors: res.errors,
      warnings: res.warnings,
      upgrades: branchConfigs
    };
  });

  return function branchifyUpgrades(_x2, _x3) {
    return _ref2.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const handlebars = require('handlebars');
const configParser = require('../../config');
const packageFileWorker = require('../package-file');

let logger = require('../../logger');

module.exports = {
  determineRepoUpgrades,
  groupByBranch,
  generateConfig,
  branchifyUpgrades,
  getPackageFileConfig
};

function generateConfig(branchUpgrades) {
  const config = {
    upgrades: []
  };
  const hasGroupName = branchUpgrades[0].groupName !== null;
  logger.debug(`hasGroupName: ${hasGroupName}`);
  // Use group settings only if multiple upgrades or lazy grouping is disabled
  const groupEligible = branchUpgrades.length > 1 || branchUpgrades[0].lazyGrouping === false;
  logger.debug(`groupEligible: ${groupEligible}`);
  const useGroupSettings = hasGroupName && groupEligible;
  logger.debug(`useGroupSettings: ${useGroupSettings}`);
  for (const branchUpgrade of branchUpgrades) {
    const upgrade = Object.assign({}, branchUpgrade);
    if (useGroupSettings) {
      // Now overwrite original config with group config
      Object.assign(upgrade, upgrade.group);
    } else {
      delete upgrade.groupName;
    }
    // Delete group config regardless of whether it was applied
    delete upgrade.group;
    delete upgrade.lazyGrouping;
    // Delete the semanticPrefix for this upgrade if not enabled
    if (upgrade.semanticCommits) {
      logger.debug('Upgrade has semantic commits enabled');
    } else {
      logger.debug('Upgrade has semantic commits disabled');
      delete upgrade.semanticPrefix;
    }
    // Use templates to generate strings
    logger.debug('Compiling branchName and prTitle');
    upgrade.branchName = handlebars.compile(upgrade.branchName)(upgrade);
    upgrade.prTitle = handlebars.compile(upgrade.prTitle)(upgrade);
    logger.debug(`${upgrade.branchName}, ${upgrade.prTitle}`);
    config.upgrades.push(upgrade);
  }
  // Now assign first upgrade's config as branch config
  return Object.assign(config, config.upgrades[0]);
}

function groupByBranch(upgrades) {
  logger.trace({ config: upgrades }, 'groupByBranch');
  logger.info(`Processing ${upgrades.length} dependency upgrade(s)`);
  const result = {
    errors: [],
    warnings: [],
    branchUpgrades: {}
  };
  for (const upg of upgrades) {
    const upgrade = Object.assign({}, upg);
    // Split out errors and wrnings first
    if (upgrade.type === 'error') {
      result.errors.push(upgrade);
    } else if (upgrade.type === 'warning') {
      result.warnings.push(upgrade);
    } else {
      // Check whether to use a group name
      let branchName;
      if (upgrade.groupName) {
        // if groupName is defined then use group branchName template for combining
        logger.debug({ branch: branchName }, `Dependency ${upgrade.depName} is part of group '${upgrade.groupName}'`);
        upgrade.groupSlug = upgrade.groupSlug || upgrade.groupName.toLowerCase().replace(/[^a-z0-9+]+/g, '-');
        branchName = handlebars.compile(upgrade.group.branchName)(upgrade);
      } else {
        // Use regular branchName template
        branchName = handlebars.compile(upgrade.branchName)(upgrade);
      }
      result.branchUpgrades[branchName] = result.branchUpgrades[branchName] || [];
      result.branchUpgrades[branchName] = [upgrade].concat(result.branchUpgrades[branchName]);
    }
  }
  logger.debug(`Returning ${Object.keys(result.branchUpgrades).length} branch(es)`);
  return result;
}

function getPackageFileConfig(repoConfig, index) {
  let packageFile = repoConfig.packageFiles[index];
  if (typeof packageFile === 'string') {
    packageFile = { packageFile };
  }
  const packageFileConfig = configParser.mergeChildConfig(repoConfig, packageFile);
  repoConfig.logger.trace({ config: repoConfig }, 'repoConfig');
  packageFileConfig.logger = packageFileConfig.logger.child({
    repository: packageFileConfig.repository,
    packageFile: packageFileConfig.packageFile
  });
  packageFileConfig.logger.trace({ config: packageFileConfig }, 'packageFileConfig');
  return configParser.filterConfig(packageFileConfig, 'packageFile');
}