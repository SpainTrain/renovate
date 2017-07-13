let start = (() => {
  var _ref = _asyncToGenerator(function* () {
    try {
      const config = yield configParser.parseConfigs(process.env, process.argv);
      config.logger = logger;
      config.versions = versions.detectVersions(config);
      // Iterate through repositories sequentially
      for (let index = 0; index < config.repositories.length; index += 1) {
        const repoConfig = module.exports.getRepositoryConfig(config, index);
        repoConfig.logger.info('Renovating repository');
        yield repositoryWorker.renovateRepository(repoConfig);
        repoConfig.logger.info('Finished repository');
      }
      logger.info('Renovate finished');
    } catch (err) {
      logger.fatal(`Renovate fatal error: ${err.message}`);
      logger.error(err);
    }
  });

  return function start() {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const logger = require('../../logger');
const configParser = require('../../config');
const repositoryWorker = require('../repository');
const versions = require('./versions');

module.exports = {
  start,
  getRepositoryConfig
};

function getRepositoryConfig(globalConfig, index) {
  let repository = globalConfig.repositories[index];
  if (typeof repository === 'string') {
    repository = { repository };
  }
  const repoConfig = configParser.mergeChildConfig(globalConfig, repository);
  repoConfig.logger = logger.child({
    repository: repoConfig.repository
  });
  repoConfig.isGitHub = repoConfig.platform === 'github';
  repoConfig.isGitLab = repoConfig.platform === 'gitlab';
  return configParser.filterConfig(repoConfig, 'repository');
}