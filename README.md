# new-bin-okx-1

1、对接okex永续合约；

2、追踪止损为多单最近3根k线的低点-百分比，空单为3根k线的高点+百分比；

3、止损反手同仓位订单，并且止损仍然是最近3跟k线的最远点根据订单方向+或者-百分比；

4、单一品种浮亏超过账户余额的15%，平掉该订单（百分之15是一个参数也可以调节）；

5、单一品种仓位不能超过总仓位的10%（10%这个参数可以调节），超过部分减仓到百分之10


6、止盈不反手，止损一直反手；

7、反手默认为true，false时损了就损了；

8、可调整参数包含：最近x k线高低点（默认3根k）、偏离百分比（默认0.2%）、是否反手（默认true）、浮亏平仓阈值(默认15%）、超仓位平仓阈值（默认超过10%就算超）、k 线周期（默认30m）