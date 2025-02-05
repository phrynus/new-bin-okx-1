// import WebSocket from "./node_modules/ccxt/js/src/base/ws/WsClient.js";
// bun build --compile --target=bun-windows-x64-baseline --minify --sourcemap --bytecode main.ts --outfile myapp
// bun build --compile --target=bun-linux-x64-baseline --minify --sourcemap --bytecode main.ts --outfile myapp
import ccxt from "ccxt";
import config from "./config.ts";

const okxClient = new ccxt.pro.okx({
  apiKey: config.apiKey,
  secret: config.secret,
  password: config.password
});
okxClient.httpProxy = config.proxy;
okxClient.wssProxy = config.proxy;

const okxTime = await okxClient.fetchTime();
console.log(
  `v${ccxt.version}  时间: ${new Date(okxTime + 8 * 60 * 60 * 1000).toISOString()} - ${Date.now() - okxTime}`
);
// 获取最近3根K线的低点或高点
const getRecentKLineData = async (symbol: string, limit: number = 3) => {
  try {
    const klines = await okxClient.fetchOHLCV(symbol, config.kLinePeriod, undefined, limit);
    const lows = klines.map((k) => k[3]).sort((a: any, b: any) => a - b)[0];
    const highs = klines.map((k) => k[2]).sort((a: any, b: any) => b - a)[0];
    return { lows, highs };
  } catch (error) {
    console.log(error);
    return { lows: 0, highs: 0 };
  }
};

var ordersIds: any = {};

while (true) {
  try {
    let orders = await okxClient.watchOrders();
    // 订单监听
    orders.forEach(async (order) => {
      // 判断是否是SWAP交易 并且已经成交
      try {
        if (order?.info?.instType == "SWAP") {
          if (order.status == "closed") {
            // 成交
            // console.log(order);
            if (order.info.algoClOrdId?.startsWith("stopLoss") && config.reverse) {
              // 止损
              okxClient.setLeverage(order.info.lever, order.symbol);
              let createOrder = await okxClient.createOrder(
                order.symbol,
                "market",
                order.side == "sell" ? "sell" : "buy",
                order.amount,
                undefined
              );
              console.log(`反手${order.side == "sell" ? "空" : "多"}单:${order.symbol} 成本:${order.cost}`);
              if (!ordersIds[order.symbol]) {
                ordersIds[order.symbol] = [];
              }
              ordersIds[order.symbol].push(createOrder.id);
            } else if (order.info.algoClOrdId?.startsWith("Exceed")) {
            } else if (order.reduceOnly == false) {
              // 开单
              if (config.isKLineLoss) {
                const { lows, highs } = await getRecentKLineData(order.symbol, config.kLineCount);
                if (!lows || !highs) throw "K线获取失败 网络不稳定";
                console.log(`当前K线低点：${lows} 高点：${highs}`);
                // 取账号余额
                const balance = await okxClient.fetchBalance(); // 获取账户余额
                const bf = Number(config.deviation) / 100;
                const cost = order.side == "sell" ? highs * (1 + bf) : lows * (1 - bf);
                okxClient.setLeverage(order.info.lever, order.symbol);
                if (order.cost > balance?.USDT?.total / config.positionBalance) {
                  // 超出
                  const exceed = order.cost - balance?.USDT?.total / config.positionBalance;
                  console.log(
                    `开单数量：${order.cost} 账户余额：${balance?.USDT?.total} 超标金额: ${
                      order.cost - balance?.USDT?.total / config.positionBalance
                    }`
                  );
                  await okxClient
                    .createOrder(
                      order.symbol,
                      "market",
                      order.side == "sell" ? "buy" : "sell",
                      (order.cost - balance?.USDT?.total / config.positionBalance) / (order.cost / order.amount),
                      undefined,
                      {
                        reduceOnly: true,
                        clientOrderId: `Exceed${order.id}`
                      }
                    )
                    .catch((e) => {
                      console.log(e);
                    });
                }
                console.log(`监听${order.side == "sell" ? "空" : "多"}单: ${order.symbol} 止损：${cost}`);
                let createOrder = await okxClient.createOrder(
                  order.symbol,
                  "limit",
                  order.side == "sell" ? "buy" : "sell",
                  order.amount,
                  undefined,
                  {
                    clientOrderId: `stopLoss${order.id}`,
                    stopLossPrice: cost
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
                    trigger: true
                  })
                  .catch((e) => {
                    console.log("订单已取消");
                  });
                ordersIds[order.symbol] = [];
              }
            }
          } else if (order.status == "open") {
            // 未成交
          }
        }
      } catch (e) {
        console.log(e);
      }
    });
  } catch (e) {
    console.log(e);
    break;
  }
}
