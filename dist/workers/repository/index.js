let renovateRepository = (() => {
  var _ref = _asyncToGenerator(function* (packageFileConfig) {
    let config = Object.assign({}, packageFileConfig);
    config.errors = [];
    config.warnings = [];
    config.logger.trace({ config }, 'renovateRepository');
    try {
      config = yield apis.initApis(config);
      config = yield apis.mergeRenovateJson(config);
      if (config.enabled === false) {
        config.logger.debug('repository is disabled');
        return;
      }
      if (config.baseBranch) {
        if (yield config.api.branchExists(config.baseBranch)) {
          yield config.api.setBaseBranch(config.baseBranch);
        } else {
          const message = `The configured baseBranch "${config.baseBranch}" is not present. Ignoring`;
          config.errors.push({
            depName: 'baseBranch',
            message
          });
          config.logger.warn(message);
        }
      }
      if (config.packageFiles.length === 0) {
        config.logger.debug('Detecting package files');
        config = yield apis.detectPackageFiles(config);
        if (config.packageFiles.length === 0) {
          if (!config.hasRenovateJson) {
            config.logger.debug('Checking if repository has a package.json');
            const pJson = yield config.api.getFileJson('package.json');
            if (!pJson) {
              config.logger.info('Repository has no package.json');
              return;
            }
          }
          config.packageFiles.push('package.json');
        }
      }
      config.repoIsOnboarded = yield onboarding.getOnboardingStatus(config);
      if (!config.repoIsOnboarded) {
        config.contentBaseBranch = 'renovate/configure';
        const packageFiles = config.packageFiles;
        config = yield apis.mergeRenovateJson(config, 'renovate/configure');
        if (config.packageFiles.length === 0) {
          config.packageFiles = packageFiles;
        }
        if (config.baseBranch) {
          if (yield config.api.branchExists(config.baseBranch)) {
            config.contentBaseBranch = config.baseBranch;
          } else {
            const message = `The configured baseBranch "${config.baseBranch}" is not present. Ignoring`;
            config.errors.push({
              depName: 'baseBranch',
              message
            });
            config.logger.warn(message);
          }
        }
      }
      const allUpgrades = yield upgrades.determineRepoUpgrades(config);
      const res = yield upgrades.branchifyUpgrades(allUpgrades, config.logger);
      config.errors = config.errors.concat(res.errors);
      config.warnings = config.warnings.concat(res.warnings);
      const branchUpgrades = res.upgrades;
      config.logger.debug(`Updating ${branchUpgrades.length} branch(es)`);
      config.logger.trace({ config: branchUpgrades }, 'branchUpgrades');
      let branchList;
      if (config.repoIsOnboarded) {
        for (const branchUpgrade of branchUpgrades) {
          yield branchWorker.processBranchUpgrades(branchUpgrade, config.errors, config.warnings);
        }
        branchList = branchUpgrades.map(function (upgrade) {
          return upgrade.branchName;
        });
        config.logger.debug(`branchList=${branchList}`);
        yield cleanup.pruneStaleBranches(config, branchList);
      } else {
        yield onboarding.ensurePr(config, branchUpgrades);
        config.logger.info('"Configure Renovate" PR needs to be closed first');
        branchList = ['renovate/configure'];
      }
      yield cleanup.pruneStaleBranches(config, branchList);
    } catch (error) {
      // Swallow this error so that other repositories can be processed
      config.logger.error(`Failed to process repository: ${error.message}`);
      config.logger.debug({ error });
    }
  });

  return function renovateRepository(_x) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Workers
const branchWorker = require('../branch');
// children
const apis = require('./apis');
const onboarding = require('./onboarding');
const upgrades = require('./upgrades');
const cleanup = require('./cleanup');

module.exports = {
  renovateRepository
};