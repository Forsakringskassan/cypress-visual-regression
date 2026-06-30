export = getToMatchScreenshotsPlugin;
declare function getToMatchScreenshotsPlugin(
    on: any,
    config: Cypress.PluginConfigOptions,
    options?: {
        threshold?: number;
        retries?: number;
    },
): Cypress.PluginConfigOptions;
