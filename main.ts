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
      limit
    );
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

const ordersIds: any = {};
if (config.isFloatLoss) {
  (async () => {
    while (true) {
      try {
        const MyTrades = await okxClient.watchPositions();
        for (const trade of MyTrades) {
          if (trade.unrealizedPnl == undefined) continue;
          const balance: any = await okxClient.fetchBalance(); // 获取账户余额
          let total = balance?.USDT?.total | 0;
          let loss = total * (config.floatLoss / 100);
          // console.log(
          //   `${trade.symbol} - 当前损益：${trade.unrealizedPnl} 阈值：${-loss} `
          // );

          if (-loss > trade.unrealizedPnl) {
            console.log(
              `浮亏超过账户余额的${config.floatLoss}%，平掉该订单：${trade.symbol}`
            );
            await okxClient.setLeverage(trade.leverage, trade.symbol);
            if (trade.contracts != null) {
              await okxClient
                .createOrder(
                  trade.symbol,
                  'market',
                  trade.side == 'long' ? 'sell' : 'buy',
                  trade.contracts,
                  undefined,
                  {
                    reduceOnly: true,
                  }
                )
                .catch((e) => {
                  console.log(e, trade.contracts);
                });
            }
          }
        }
      } catch (e) {
        console.log(e);
        break;
      }
    }
  })();
}
while (true) {
  try {
    const orders = await okxClient.watchOrders();
    // 订单监听
    for (const order of orders) {
      // console.log(order.symbol);
      // 判断是否是SWAP交易 并且已经成交
      try {
        if (order?.info?.instType == 'SWAP') {
          if (order.status == 'closed') {
            // 成交
            // console.log(order);
            if (
              order.info.algoClOrdId?.startsWith('stopLoss') &&
              config.reverse
            ) {
              // 止损
              await okxClient.setLeverage(order.info.lever, order.symbol);
              let createOrder = await okxClient.createOrder(
                order.symbol,
                'market',
                order.side == 'sell' ? 'sell' : 'buy',
                order.amount,
                undefined
              );
              console.log(
                `反手${order.side == 'sell' ? '空' : '多'}单：${order.symbol} 成本:${order.cost}`
              );
              if (!ordersIds[order.symbol]) {
                ordersIds[order.symbol] = [];
              }
              ordersIds[order.symbol].push(createOrder.id);
            } else if (
              order.info.algoClOrdId?.startsWith('Exceed') ||
              order.clientOrderId?.startsWith('Exceed')
            ) {
              // 跳出 for 循环
            } else if (order.reduceOnly == false) {
              // 开单
              if (config.isKLineLoss) {
                const { lows, highs } = await getRecentKLineData(
                  order.symbol,
                  config.kLineCount
                );
                if (!lows || !highs) {
                  throw new Error('获取K线数据失败');
                }
                // console.log(`当前K线低点：${lows} 高点：${highs}`);
                // 取账号余额
                const balance: any = await okxClient.fetchBalance(); // 获取账户余额
                const bf = Number(config.deviation) / 100;
                const cost =
                  order.side == 'sell' ? highs * (1 + bf) : lows * (1 - bf);
                await okxClient.setLeverage(order.info.lever, order.symbol);
                let total = balance?.USDT?.total | 0;
                if (
                  order.cost > total * (config.floatLoss / 100) &&
                  config.isPositionBalance
                ) {
                  // 超出
                  const exceed = order.cost - total / config.positionBalance;
                  console.log(
                    `开单金额：${order.cost} 账户余额：${total} 超标金额: ${
                      exceed
                    }`
                  );
                  let amount = exceed / (order.cost / order.amount);
                  await okxClient
                    .createOrder(
                      order.symbol,
                      'market',
                      order.side == 'sell' ? 'buy' : 'sell',
                      Number(numDecimalLength(order.amount, amount)),
                      undefined,
                      {
                        reduceOnly: true,
                        clientOrderId: `Exceed${order.id}`,
                      }
                    )
                    .catch((e) => {
                      console.log(
                        e,
                        Number(numDecimalLength(order.amount, amount))
                      );
                    });
                }
                console.log(
                  `挂载${order.side == 'sell' ? '空' : '多'}单：${order.symbol} 止损：${cost}`
                );
                let createOrder = await okxClient.createOrder(
                  order.symbol,
                  'limit',
                  order.side == 'sell' ? 'buy' : 'sell',
                  order.amount,
                  undefined,
                  {
                    clientOrderId: `stopLoss${order.id}`,
                    stopLossPrice: cost,
                  }
                );
                if (!ordersIds[order.symbol]) {
                  ordersIds[order.symbol] = [];
                }
                ordersIds[order.symbol].push(createOrder.id);
              }
            } else if (order.reduceOnly == true) {
              if (ordersIds[order.symbol]) {
                // 取消手动订单
                await okxClient
                  .cancelOrders(ordersIds[order.symbol], order.symbol, {
                    trigger: true,
                  })
                  .catch(() => {})
                  .then(() => {});
                console.log(
                  '清理不必要订单',
                  order.symbol,
                  ordersIds[order.symbol]
                );
                ordersIds[order.symbol] = [];
              }
            }
          } else if (order.status == 'open') {
            // 未成交
          }
        }
      } catch (e) {
        console.log(e);
      }
    }
  } catch (e) {
    console.log(e);
    break;
  }
}
