const { execFileSync } = require("child_process");
const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("/usr/bin/xattr", ["-cr", appPath], { stdio: "inherit" });
  const screenHelperPath = path.join(
    appPath,
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "desktop",
    "bin",
    "奇遇AI屏幕助手.app",
  );
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign", "-",
    "--identifier", "com.qiyuai.automation",
    "--requirements", '=designated => identifier "com.qiyuai.automation"',
    screenHelperPath,
  ], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign", "-",
    "--identifier", context.packager.appInfo.id,
    "--requirements", `=designated => identifier "${context.packager.appInfo.id}"`,
    appPath,
  ], { stdio: "inherit" });
};
