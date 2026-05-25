import { defineConfig } from "cypress";

export default defineConfig({
    screenshotOnRunFailure: false,
    video: false,
    e2e: {
        async setupNodeEvents(on, config) {
            /* defer importing this as Jenkins tries to load the config before
             * the plugin has been built */
            const { default: getToMatchScreenshotsPlugin } =
                /* eslint-disable-next-line import-x/extensions -- need extension */
                await import("./dist/plugin.js");
            config = getToMatchScreenshotsPlugin(on, config);
            return config;
        },
    },
});
