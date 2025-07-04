module.exports = {
  testRunner: "jest-circus/runner",
  setupFilesAfterEnv: ["jest-expect-message"],
  reporters: [
    "default",
    [
      "/app/reporters/custom-junit-reporter.js",
      {
        outputDirectory: "test-reports",
        outputName: "results.xml",
      },
    ],
  ],
};
