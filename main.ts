// import WebSocket from "./node_modules/ccxt/js/src/base/ws/WsClient.js";
// bun build --compile --target=bun-windows-x64-baseline --minify --sourcemap main.ts --outfile main
// bun build --compile --target=bun-linux-x64-baseline --minify --sourcemap main.ts --outfile main
import ccxt from 'ccxt';
import config from './config.ts';

const okxClient = new ccxt.pro.okx({
  apiKey: config.apiKey,
  secret: config.secret,
  password: config.password,
});
okxClient.httpProxy = config.proxy;
okxClient.wssProxy = config.proxy;

const ping = async () => {
  try {
    const okxTime = await okxClient.fetchTime();
    console.log(
      `v${ccxt.version}  时间: ${new Date(okxTime + 8 * 60 * 60 * 1000).toISOString()} - ${Date.now() - okxTime}`
    );
    return true;
  } catch (error) {
    console.log('网络错误');
    return false;
  }
};
while (true) {
  if (await ping()) {
    break;
  }
}
const getRecentKLineData = async (symbol: string, limit: number = 3) => {
  try {
    const klines = await okxClient.fetchOHLCV(
      symbol,
      config.kLinePeriod,
      undefined,
      limit + 1
    );
    delete klines[limit];
    const lows = klines.map((k) => k[3]).sort((a: any, b: any) => a - b)[0];
    const highs = klines.map((k) => k[2]).sort((a: any, b: any) => b - a)[0];
    return { lows, highs };
  } catch (error) {
    console.log(error);
    return { lows: 0, highs: 0 };
  }
};
const numDecimalLength = (num1: number, num2: number) => {
  const decimalLength = (num1.toString().split('.')[1] || '').length;
  // 根据小数位数调整第二个参数的精度
  return num2.toFixed(decimalLength);
};
let errorSymbol: any[] = [];
if (config.isFloatLoss) {
  (async () => {
    while (true) {
      try {
        const MyTrades = await okxClient.watchPositions();
        for (const trade of MyTrades) {
          try {
            if (trade.unrealizedPnl == undefined) continue;
            const balance: any = await okxClient.fetchBalance(); // 获取账户余额
            let total = Number(balance?.USDT?.total);
            if (!total) {
              console.log('获取账户余额失败');
              continue;
            }
            const { lows, highs } = await getRecentKLineData(
              trade.symbol,
              config.kLineCount
            );
            if (!lows || !highs) {
              console.log('获取K线数据失败');
              continue;
            }

            // 浮亏超过账户余额止损
            await okxClient.setLeverage(trade.leverage, trade.symbol);
            let loss = (Number(config.floatLoss) / 100) * total;
            console.log(
              `\n${trade.symbol}:${trade.side} \n账户余额：${total} \n盈亏：${trade.unrealizedPnl} \n风控：${-loss}`
            );
            if (config.isKLineLoss) {
              console.log(
                `价格：${trade.markPrice}\n 高低：${highs} - ${lows}`
              );
            }

            if (-loss > trade.unrealizedPnl && config.isFloatLoss) {
              console.log(
                `浮亏超过账户余额的${config.floatLoss}%，平掉该订单：${trade.symbol}`
              );
              await okxClient.closePosition(trade.symbol);
            }

            // 高低点止损
            if (config.isKLineLoss) {
              const bf = Number(config.deviation) / 100;
              if (
                trade.markPrice &&
                ((trade.side == 'long' && trade.markPrice < lows * (1 - bf)) ||
                  (trade.side == 'short' && trade.markPrice > highs * (1 + bf)))
              ) {
                console.log(`${trade.symbol} 止损`);
                await okxClient.closePosition(trade.symbol);
                if (
                  config.reverse &&
                  trade.contracts &&
                  trade.unrealizedPnl < 0
                ) {
                  console.log(`${trade.symbol} 翻转`);
                  await okxClient.createOrder(
                    trade.symbol,
                    'market',
                    trade.side == 'long' ? 'sell' : 'buy',
                    trade.contracts,
                    undefined
                  );
                }
              }
              // 翻转
            }
            // 超余额阈值
            if (trade.contracts && trade.notional && config.isPositionBalance) {
              const maxAllowedPosition = total * (config.positionBalance / 100);
              // 如果当前持仓超出了最大允许仓位，则需要平仓
              if (trade.notional > maxAllowedPosition) {
                const exceed = trade.notional - maxAllowedPosition;
                let amount = exceed / (trade.notional / trade.contracts);
                amount = Number(numDecimalLength(trade.notional, amount));
                try {
                  // 判断errorSymbol数组里面是否有一样的订单号
                  if (!errorSymbol.includes(trade.id)) {
                    // console.log(
                    //   `${trade.symbol} 超出最大允许仓位\n当前仓位：${trade.notional}\n最大允许：${maxAllowedPosition}`
                    // );
                    await okxClient
                      .createOrder(
                        trade.symbol,
                        'market',
                        trade.side == 'long' ? 'sell' : 'buy',
                        amount,
                        undefined,
                        {
                          reduceOnly: true,
                        }
                      )
                      .catch((e) => {
                        // console.log(`平仓失败：${e}`);
                        // errorSymbol.push(trade.id);
                      })
                      .then(() => {
                        // console.log(
                        //   `平仓成功：${trade.symbol}`,
                        //   '可能会再弹出一次平仓失败,不必理会'
                        // );
                        // // 删除 errorSymbol数组里面一样的订单号
                        // errorSymbol = errorSymbol.filter((item) => {
                        //   return item != trade.id;
                        // })
                      });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {
            console.log(e);
          }
        }
        // 延迟1s
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (e) {
        console.log(e);
        break;
      }
    }
  })();
}
