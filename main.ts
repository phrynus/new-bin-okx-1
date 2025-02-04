// bun build --compile --target=bun-windows-x64-baseline --minify --sourcemap --bytecode main.ts --outfile myapp
// bun build --compile --target=bun-linux-x64-baseline --minify --sourcemap --bytecode main.ts --outfile myapp
import ccxt from 'ccxt';
import config from './config.ts';

const okxClient = new ccxt.pro.okx({
  apiKey: config.apiKey,
  secret: config.secret,
  password: config.password,
});
okxClient.httpProxy = config.proxy;
okxClient.wssProxy = config.proxy;

const okxTime = await okxClient.fetchTime();
console.log(
  `v${ccxt.version}  时间: ${new Date(okxTime + 8 * 60 * 60 * 1000).toISOString()} - ${Date.now() - okxTime}`
);
while (true) {
  try {
    let orders = await okxClient.watchOrders();
    orders.forEach((order) => {
      if (order?.info?.instType == 'SWAP' && order.filled > 0) {
        // 下单成功
        console.log(
          `下单成功:${order.symbol} 成本:${order.cost}`,
          JSON.stringify(order)
        );
      }
    });
  } catch (e) {
    console.log(e);
    break;
  }
}
