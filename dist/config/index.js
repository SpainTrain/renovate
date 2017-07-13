let parseConfigs = (() => {
  var _ref = _asyncToGenerator(function* (env, argv) {
    logger.debug('Parsing configs');

    // Get configs
    const defaultConfig = defaultsParser.getConfig();
    const fileConfig = fileParser.getConfig(env);
    const cliConfig = cliParser.getConfig(argv);
    const envConfig = envParser.getConfig(env);

    const config = Object.assign({}, defaultConfig, fileConfig, envConfig, cliConfig);

    // Set log level
    logger.levels('stdout', config.logLevel);

    // Add file logger
    if (config.logFile) {
      logger.debug(`Enabling ${config.logFileLevel} logging to ${config.logFile}`);
      logger.addStream({
        name: 'logfile',
        path: config.logFile,
        level: config.logFileLevel
      });
    }

    logger.trace({ config: defaultConfig }, 'Default config');
    logger.debug({ config: fileConfig }, 'File config');
    logger.debug({ config: cliConfig }, 'CLI config');
    logger.debug({ config: envConfig }, 'Env config');

    // Get global config
    logger.trace({ config }, 'Raw config');

    // Check platforms and tokens
    if (config.platform === 'github') {
      if (!config.githubAppId && !config.token && !env.GITHUB_TOKEN) {
        throw new Error('You need to supply a GitHub token.');
      }
      config.api = githubApi;
    } else if (config.platform === 'gitlab') {
      if (!config.token && !env.GITLAB_TOKEN) {
        throw new Error('You need to supply a GitLab token.');
      }
      config.api = gitlabApi;
    } else {
      throw new Error(`Unsupported platform: ${config.platform}.`);
    }

    if (config.githubAppId) {
      logger.info('Initialising GitHub App mode');
      if (!config.githubAppKey) {
        throw new Error('A GitHub App Private Key must be provided');
      }
      config.repositories = yield githubApp.getRepositories(config);
      logger.info(`Found ${config.repositories.length} repositories installed`);
      logger.debug({ config }, 'GitHub App config');
    } else if (config.autodiscover) {
      // Autodiscover list of repositories
      if (config.platform === 'github') {
        logger.info('Autodiscovering GitHub repositories');
        config.repositories = yield githubApi.getRepos(config.token, config.endpoint);
      } else if (config.platform === 'gitlab') {
        logger.info('Autodiscovering GitLab repositories');
        config.repositories = yield gitlabApi.getRepos(config.token, config.endpoint);
      }
      if (!config.repositories || config.repositories.length === 0) {
        // Soft fail (no error thrown) if no accessible repositories
        logger.info('The account associated with your token does not have access to any repos');
        return config;
      }
    } else if (!config.repositories || config.repositories.length === 0) {
      // We need at least one repository defined
      throw new Error('At least one repository must be configured, or use --autodiscover');
    }

    // Print config
    logger.trace({ config }, 'Global config');
    // Remove log file entries
    delete config.logFile;
    delete config.logFileLevel;
    return config;
  });

  return function parseConfigs(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const logger = require('../logger');
const githubApi = require('../api/github');
const gitlabApi = require('../api/gitlab');

const definitions = require('./definitions');

const defaultsParser = require('./defaults');
const fileParser = require('./file');
const cliParser = require('./cli');
const envParser = require('./env');

const githubApp = require('./github-app');

module.exports = {
  parseConfigs,
  mergeChildConfig,
  filterConfig,
  getOnboardingConfig
};

function mergeChildConfig(parentConfig, childConfig) {
  const config = Object.assign({}, parentConfig, childConfig);
  for (const option of definitions.getOptions()) {
    if (option.mergeable && childConfig[option.name]) {
      logger.debug(`mergeable option: ${option.name}`);
      // TODO: handle arrays
      config[option.name] = Object.assign({}, parentConfig[option.name], childConfig[option.name]);
      logger.debug(`config.${option.name}=${JSON.stringify(config[option.name])}`);
    }
  }
  return config;
}

function filterConfig(inputConfig, targetStage) {
  logger.trace({ config: inputConfig }, `filterConfig('${targetStage}')`);
  const outputConfig = Object.assign({}, inputConfig);
  const stages = ['global', 'repository', 'packageFile', 'depType', 'package', 'branch', 'pr'];
  const targetIndex = stages.indexOf(targetStage);
  for (const option of definitions.getOptions()) {
    const optionIndex = stages.indexOf(option.stage);
    if (optionIndex !== -1 && optionIndex < targetIndex) {
      delete outputConfig[option.name];
    }
  }
  return outputConfig;
}

function getOnboardingConfig(repoConfig) {
  const config = {};
  for (const option of definitions.getOptions()) {
    if (option.stage !== 'global' && option.onboarding !== false) {
      config[option.name] = repoConfig[option.name];
    }
  }
  if (repoConfig.detectedPackageFiles) {
    config.packageFiles = [];
  }
  return config;
}