let getUserRepositories = (() => {
  var _ref = _asyncToGenerator(function* (appToken, installationId) {
    logger.debug(`githubApp.getUserRepositories(appToken, ${installationId})`);
    const userToken = yield ghApi.getInstallationToken(appToken, installationId);
    logger.debug(`userToken=${userToken}`);
    const userRepositories = yield ghApi.getInstallationRepositories(userToken);
    logger.debug(`Found ${userRepositories.repositories.length} repositories`);
    return userRepositories.repositories.map(function (repository) {
      return {
        repository: repository.full_name,
        token: userToken
      };
    });
  });

  return function getUserRepositories(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

let getRepositories = (() => {
  var _ref2 = _asyncToGenerator(function* (config) {
    logger.debug(`githubApp.getRepositories`);
    const configuredRepositories = config.repositories.map(function (repository) {
      return typeof repository === 'string' ? repository : repository.repository;
    });
    let installedRepos = [];
    try {
      const appToken = module.exports.generateJwt(config.githubAppId, config.githubAppKey);
      const installations = yield ghApi.getInstallations(appToken);
      logger.info(`Found installations for ${installations.length} users`);
      for (const installation of installations) {
        logger.debug(`installation=${JSON.stringify(installation)}`);
        let installationRepos = yield module.exports.getUserRepositories(appToken, installation.id);
        logger.debug(`installationRepos=${JSON.stringify(installationRepos)}`);
        if (configuredRepositories.length) {
          installationRepos = installationRepos.filter(function (repository) {
            return configuredRepositories.indexOf(repository.repository) !== -1;
          });
        }
        installedRepos = installedRepos.concat(installationRepos);
      }
    } catch (err) {
      logger.error(`githubApp.getRepositories error: ${JSON.stringify(err)}`);
    }
    logger.debug(`installedRepos=${JSON.stringify(installedRepos)}`);
    return installedRepos;
  });

  return function getRepositories(_x3) {
    return _ref2.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const jwt = require('jsonwebtoken');
const logger = require('../logger');
const ghApi = require('../api/github');

module.exports = {
  generateJwt,
  getUserRepositories,
  getRepositories
};

function generateJwt(appId, pemFileContent) {
  logger.debug(`githubApp.generateJwt(${appId})`);
  const payload = {
    // GitHub app identifier
    iss: appId
  };
  const options = {
    // 5 minutes
    expiresIn: 300,
    // RS256 required by GitHub
    algorithm: 'RS256'
  };
  return jwt.sign(payload, pemFileContent, options);
}