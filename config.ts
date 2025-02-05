// config.ts
// 配置接口
interface Config {
  apiKey: string;
  secret: string;
  password: string;
  proxy: string;
  isKLineLoss: boolean;
  kLineCount: number; // K线数量
  kLinePeriod: string; // K线周期
  deviation: number; // 偏离百分比 默认 0.2%
  reverse: boolean; // 是否反向 默认 true
  floatLoss: number; // 浮动止损阈值 默认 15%
  isFloatLoss: boolean; // 浮动止损阈值开关 默认 true
  positionBalance: number; // 超余额阈值 默认 10%
  isPositionBalance: boolean; // 超余额阈值 默认 true
}

// 默认配置
const defaultConfig: Config = {
  apiKey: 'YOU ApiKey',
  secret: 'YOU Secret',
  password: 'YOU Password',
  proxy: '',
  isKLineLoss: true,
  kLineCount: 3,
  kLinePeriod: '30m',
  deviation: 0.2,
  reverse: true,
  floatLoss: 15,
  isFloatLoss: true,
  positionBalance: 10,
  isPositionBalance: true,
};
const configFle = Bun.file('config.json', {
  type: 'application/json',
});

const exists = await configFle.exists();
let config: Config = defaultConfig;
if (!exists) {
  await Bun.write('config.json', JSON.stringify(defaultConfig, null, 2));
  throw '配置文件不存在，已创建默认配置文件 config.json 请前往修改';
} else {
  config = await configFle.json();
  // 类型检查 - 确保配置符合预期的类型
  for (const key in defaultConfig) {
    const value = config[key as keyof Config];
    // 确保值的类型符合接口定义
    if (
      value === '' ||
      typeof value !== typeof defaultConfig[key as keyof Config] ||
      !(key in config)
    ) {
      if (key === 'proxy') continue;
      throw `请检测 配置文件参数 ${key}，应该是: ${defaultConfig[key as keyof Config]}`;
    }
  }
}

export default config;
