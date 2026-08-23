// KoreanFlow PM2 配置文件
// 宝塔「PM2 管理器」或命令行 pm2 start ecosystem.config.js 均可使用
module.exports = {
  apps: [
    {
      name: "koreanflow",
      script: "dist/boot.js", // 零依赖打包产物，无需 node_modules
      // 双保险：即使 .env 遗漏 NODE_ENV，这里也强制生产模式
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_restarts: 5, // 异常崩溃自动重启（限 5 次防死循环）
      out_file: "logs/out.log",
      error_file: "logs/error.log",
    },
  ],
};
