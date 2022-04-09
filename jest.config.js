// External API, Create React App-like environment.
let browserEnvironment = {
  displayName: "browserEnvironment",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["jest-extended"],
  testMatch: [
    "**/__tests__/browser-only/**/*-test.[jt]s?(x)",
  ],
};

module.exports = {
  projects: [
    browserEnvironment,
  ],
};
