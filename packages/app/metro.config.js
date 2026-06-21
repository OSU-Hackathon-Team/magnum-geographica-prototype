const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = false;

config.resolver.extraNodeModules = {
  "@magnum/shared": path.resolve(workspaceRoot, "packages/shared"),
  "@magnum/map": path.resolve(workspaceRoot, "packages/map"),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith(".js")) {
    const tsCandidate = moduleName.slice(0, -3) + ".ts";
    const tsxCandidate = moduleName.slice(0, -3) + ".tsx";
    try {
      return context.resolveRequest(context, tsCandidate, platform);
    } catch {
      try {
        return context.resolveRequest(context, tsxCandidate, platform);
      } catch {
        return defaultResolveRequest
          ? defaultResolveRequest(context, moduleName, platform)
          : context.resolveRequest(context, moduleName, platform);
      }
    }
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
