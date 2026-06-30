const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

const { compareImages } = require("./utils");

/** @type {string} */
let CYPRESS_SCREENSHOT_DIR = "cypress/screenshots";

/** @type {number} */
let DEFAULT_THRESHOLD = 0.01;

/** @type {number} */
let DEFAULT_RETRIES = 3;

/**
 * @param {{ screenshotsFolder?: string }} [config]
 */
function setupScreenshotPath(config = {}) {
    if (config.screenshotsFolder) {
        CYPRESS_SCREENSHOT_DIR = config.screenshotsFolder;
    }
}

/**
 * Setup default values for threshold and retries.
 * @param {{ options?: { threshold?: number, retries?: number } }}
 */
function setupVisualRegressionDefaults(options = {}) {
    if (options.threshold) {
        DEFAULT_THRESHOLD = options.threshold;
    }
    if (options.retries) {
        DEFAULT_RETRIES = options.retries;
    }
}

/**
 * Gets current default values for threshold and retries.
 * @returns {{ threshold: number, retries: number }}
 */
function visualRegressionDefaults() {
    return {
        threshold: DEFAULT_THRESHOLD,
        retries: DEFAULT_RETRIES,
    };
}

/**
 * Copies both the actual and expected image to a single folder with matching
 * filenames and a `(actual)` and `(expected)` suffix for easier comparison.
 *
 * @param {string} actual - Filepath to screenshot just just taken, the "actual" image.
 * @param {string} expected - Filepath to the screenshot we are comparing with, the "expected" image.
 * @param {string} dst - Destination directory of the copied images.
 * @param {string} basename - Base filename (without suffix and extension).
 * @returns {Promise<void>} A promise resolved when the files have been copied.
 */
async function copyMismatchingFiles(actual, expected, dst, basename) {
    await fsPromises.mkdir(dst, { recursive: true });
    await fsPromises.copyFile(
        actual,
        path.join(dst, `${basename} (actual).png`),
    );
    await fsPromises.copyFile(
        expected,
        path.join(dst, `${basename} (expected).png`),
    );
}

/**
 * Remove the screenshot from folder so we aren't left with lots of them after
 * running the tests.
 *
 * @param {string} filename - Filename of the screenshot.
 * @returns {void}
 */
function cleanup(filename) {
    if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
    }
}

async function visualRegressionCopy(args) {
    let { deleteFolder } = args;
    const { relativePath } = args;
    const folderName = path.join(CYPRESS_SCREENSHOT_DIR, "actual");

    if (fs.existsSync(path.join(CYPRESS_SCREENSHOT_DIR, "All Specs"))) {
        deleteFolder = "All Specs";
    }

    const from = path.join(
        CYPRESS_SCREENSHOT_DIR,
        relativePath,
        `${args.fileName}.png`,
    );

    const to = path.join(folderName, `${args.fileName}.png`);

    deleteFolder = path.join(CYPRESS_SCREENSHOT_DIR, deleteFolder);

    await fsPromises.mkdir(folderName, { recursive: true });
    await fsPromises.rename(from, to);

    fs.rmSync(deleteFolder, {
        recursive: true,
        force: true,
    });

    return true;
}

/**
 * @param {{fileName: string}} args
 */
async function toMatchScreenshotsPlugin(args) {
    const { fileName } = args;
    const { testingType } = args;
    let { relative } = args;
    relative = relative.replaceAll("\\", "/");

    const actualImage = path.join(
        CYPRESS_SCREENSHOT_DIR,
        "actual",
        `${fileName}.png`,
    );

    const expectedImage = path.join(
        path.dirname(args.testPath),
        "__screenshots__",
        `${fileName}.png`,
    );

    if (!fs.existsSync(expectedImage)) {
        // Create new baseline
        if (args.type === "base") {
            await fsPromises.rename(actualImage, expectedImage);
            cleanup(actualImage);
            return {};
        } else {
            return {
                error: [
                    `Base image not found\n`,
                    `'${expectedImage}'\n`,
                    `Did you forget to create image?`,
                    `Add environment variable 'type=base'\n`,
                    `$ npm run cypress run -- --env type=base --${testingType} --spec **/${relative}\n`,
                    `It is recommended to run the screenshot test individually with 'it.only' when creating base image`,
                ].join("\n"),
            };
        }
    }

    const result = await compareImages(actualImage, expectedImage, {});
    const percentage = result.rawMisMatchPercentage / 100;

    if (percentage <= args.errorThreshold) {
        // Below threshold, do nothing
        cleanup(actualImage);
        return {};
    }

    if (args.type === "base") {
        // Above threshold, update baseline
        await fsPromises.rename(actualImage, expectedImage);
        cleanup(actualImage);
        return {};
    }

    await copyMismatchingFiles(
        actualImage,
        expectedImage,
        CYPRESS_SCREENSHOT_DIR,
        fileName,
    );

    cleanup(actualImage);

    return {
        error: [
            `The "${fileName}" image is different. Threshold limit exceeded!"`,
            `Expected: ${args.errorThreshold}`,
            `Actual: ${percentage}\n`,
            `Did you forget to update image?`,
            `Add environment variable 'type=base'\n`,
            `$ npm run cypress run -- --env type=base --${testingType} --spec **/${relative}\n`,
            `It is recommended to run the screenshot test individually with 'it.only' when creating base image`,
        ].join("\n"),
    };
}

/**
 * this will produce higher resolution images and videos
 * https://on.cypress.io/browser-launch-api
 *
 * @param {{ family: "chromium" | "firefox", name: string }} browser
 */
const beforeBrowserLaunch = (browser, launchOptions) => {
    /* eslint-disable no-console -- expected to log */
    console.log();
    console.group("@forsakringskassan/cypress-visual-regression");
    console.log(`Browser family: ${browser.family}`);
    console.log(`Browser name: ${browser.name}`);
    console.log();

    if (browser.family === "chromium") {
        console.log("Disabling GPU");
        launchOptions.args.push("--disable-gpu");
    }

    if (!browser.isHeadless) {
        console.groupEnd();
        console.log();
        return launchOptions;
    }

    const width = 1920;
    const height = 1080;
    if (browser.name === "chrome") {
        console.log(
            `Changing window size to ${width}x${height} and disable retina`,
        );
        launchOptions.args.push(`--window-size=${width},${height}`);
        launchOptions.args.push("--force-device-scale-factor=1");
    }

    if (browser.name === "electron") {
        launchOptions.preferences.width = width;
        launchOptions.preferences.height = height;
    }

    console.groupEnd();
    console.log();
    return launchOptions;
    /* eslint-enable no-console */
};

function getToMatchScreenshotsPlugin(on, config, options = {}) {
    setupScreenshotPath(config);
    setupVisualRegressionDefaults(options);
    on("before:browser:launch", beforeBrowserLaunch);
    on("task", {
        toMatchScreenshotsPlugin,
        visualRegressionCopy,
        visualRegressionDefaults,
    });

    return config;
}

module.exports = getToMatchScreenshotsPlugin;
