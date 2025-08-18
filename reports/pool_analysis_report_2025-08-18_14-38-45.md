# Byreal CLMM Pool Analysis Report

Generated: 2025-08-18T14:38:45.039Z

---

## Price Convention

**Important**: All prices in this report are displayed as **FRAGME/SOL**
This means: How many FRAGME tokens equal 1 SOL

Example: Current price of 4,266.90 FRAGME/SOL means:
- 1 SOL = 4,266.90 FRAGME
- 1 FRAGME = 0.000234 SOL

---

## Pool Overview

| Metric | Value |
|--------|-------|
| Pool Address | FSmViworLwK7sTqiKf3WBtBowCQhSvVFaTt427XDevHi |
| Token 0 (SOL) | So11111111111111111111111111111111111111112 |
| Token 1 (FRAGME) | FRAGMEWj2z65qM62zqKhNtwNFskdfKs4ekDUDX3b4VD5 |
| Current Price | 4,266.90 FRAGME/SOL |
| Current Tick | 83590 |
| Tick Spacing | 10 |
| Status | Active |
| TVL | 414,124.56 |
| Total Liquidity | 918971848625722 |

## Market Metrics

### Pool Metrics

| Metric | Value |
|--------|-------|
| Token 0 Balance | 1807.304286058 SOL |
| Token 1 Balance | 9958686.036307724 FRAGME |
| Total Positions | 10 |
| Active Positions | 6 |
| Inactive Positions | 4 |
| Utilization Rate | 60.00% |

### Current Prices (USD)

| Asset | Price (USD) | Notes |
|-------|-------------|-------|
| SOL | $182.06 | Market price |
| FRAGME | $0.0427 | Calculated from pool |
| Pool Price | 4,266.90 FRAGME/SOL | Current pool ratio |

### Total Value Locked (TVL)

| Component | Amount | Value (USD) |
|-----------|--------|-------------|
| SOL | 1807.3043 | $329037.82 |
| FRAGME | 9958686.0363 | $424917.36 |
| **Total TVL** | - | **$753955.18** |

*Price data source: Calculated at 11:38:45 PM*

## Position Statistics

### Liquidity Distribution

| Type | Liquidity | Percentage |
|------|-----------|------------|
| Total | 762050571924882 | 100.00% |
| Active | 633565713299566 | 83.14% |
| Inactive | 128484858625316 | 16.86% |

## Liquidity-Based Slippage Analysis

### Overview
Analysis of slippage at each liquidity change point (where positions enter/exit range)

### SOL → FRAGME Liquidity Breakpoints

| Tick | Swap Amount | Output | Slippage | Price Impact | Liquidity Change | New Liquidity |
|------|-------------|--------|----------|--------------|------------------|---------------|
| 70400 | 241857355115012162618512.420420078 SOL | 28987131.037918664 FRAGME | 100.000% | 73.270% | -127428804445385 | 791543044180337 |
| 80210 | 409097699466105245985654.026149182 SOL | 45914204.283687896 FRAGME | 100.000% | 28.690% | +127428804445385 | 918971848625722 |
| 80410 | 412149177615914425177985.781375181 SOL | 46423657.848615024 FRAGME | 100.000% | 27.230% | -150791364196 | 918821057261526 |
| 82440 | 441449939519342209393853.375140183 SOL | 51892490.930357749 FRAGME | 100.000% | 10.850% | -153798172619070 | 765022884642456 |
| 82750 | 444962315961302027306434.899787651 SOL | 52629421.757635336 FRAGME | 100.000% | 8.060% | -176969624346 | 764845915018110 |
| 82970 | 447421580771866750765260.635461986 SOL | 53159254.987356973 FRAGME | 100.000% | 6.000% | -285990575733336 | 478855339284774 |
| 83310 | 449768051471036186997802.744886919 SOL | 53679141.642831625 FRAGME | 100.000% | 2.760% | -159921308516746 | 318934030768028 |
| 83380 | 450086525837631565631264.602759178 SOL | 53751164.543598459 FRAGME | 100.000% | 2.080% | -33527895441872 | 285406135326156 |

### FRAGME → SOL Liquidity Breakpoints

| Tick | Swap Amount | Output | Slippage | Price Impact | Liquidity Change | New Liquidity |
|------|-------------|--------|----------|--------------|------------------|---------------|
| 83710 | 358707.426853599 FRAGME | 1544631274974058009438.838442425 SOL | 100.000% | 1.210% | +69484994030 | 919041333619752 |
| 83760 | 509567.914555123 FRAGME | 2188773338888359588225.85827547 SOL | 100.000% | 1.710% | +275163663215 | 919316497282967 |
| 83820 | 691153.371347251 FRAGME | 2959852055316230043365.595748997 SOL | 100.000% | 2.320% | +711405522686 | 920027902805653 |
| 84240 | 1978614.536341999 FRAGME | 8297245824242907430982.49316075 SOL | 100.000% | 6.720% | -150791364196 | 919877111441457 |
| 84490 | 2757767.248384385 FRAGME | 11420947534517522550153.029744107 SOL | 100.000% | 9.420% | -33527895441872 | 886349215999585 |
| 84750 | 3548570.026930166 FRAGME | 14511536144045852723678.80604058 SOL | 100.000% | 12.300% | -176969624346 | 886172246375239 |
| 84760 | 3579185.177944898 FRAGME | 14629580910348786989695.021329853 SOL | 100.000% | 12.420% | -275163663215 | 885897082712024 |
| 84820 | 3763140.738107344 FRAGME | 15336391902921847932184.105967983 SOL | 100.000% | 13.100% | -711405522686 | 885185677189338 |
| 84930 | 4101557.218455629 FRAGME | 16625681747442430716029.02903153 SOL | 100.000% | 14.340% | -69484994030 | 885116192195308 |
| 84980 | 4255987.117632022 FRAGME | 17209336818531680984941.073800652 SOL | 100.000% | 14.900% | -285990575733336 | 599125616461972 |
| 85330 | 4995073.476769014 FRAGME | 19947344150745286671241.743992384 SOL | 100.000% | 19.010% | -159921308516746 | 439204307945226 |
| 86520 | 6909773.847270971 FRAGME | 26514861641868396486402.523255447 SOL | 100.000% | 34.060% | -153798172619070 | 285406135326156 |

### Key Observations

**SOL → FRAGME Direction:**
- At 447421580771866750765260.635461986 SOL: 37.0% liquidity drop causing 100.00% slippage
- At 449768051471036186997802.744886919 SOL: 33.0% liquidity drop causing 100.00% slippage

**FRAGME → SOL Direction:**
- At 4255987.117632022 FRAGME: 32.0% liquidity drop causing 100.00% slippage
- At 4995073.476769014 FRAGME: 26.0% liquidity drop causing 100.00% slippage
- At 6909773.847270971 FRAGME: 35.0% liquidity drop causing 100.00% slippage

### Recommended Trade Sizes by Slippage Tolerance

| Slippage Tolerance | SOL → FRAGME | FRAGME → SOL |
|-------------------|--------------|---------------|
| 0.1% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |
| 0.25% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |
| 0.5% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |
| 1% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |
| 2% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |
| 5% | < 241857355115012162618512.420420078 SOL | < 358707.426853599 FRAGME |

*Note: Slippage increases significantly at liquidity boundaries where large positions exit the active range.*

## Ownership Analysis

| Metric | Value |
|--------|-------|
| Unique Owners | 7 |
| Average Positions per Owner | 1.43 |
| Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6 Positions | 4 |
| Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6 Liquidity | 727138861314537 |

## All Positions

| # | Owner | Active | Price Range | Liquidity | NFT Mint |
|---|-------|--------|-------------|-----------|----------|
| 1 | Bht3rxNx... | Yes | 4,010.16-4,902.87 | 285990575733336 | tdRWo41B... |
| 2 | Bht3rxNx... | Yes | 4,148.84-5,077.50 | 159921308516746 | 9gZFyaQR... |
| 3 | Bht3rxNx... | Yes | 3,803.16-5,719.10 | 153798172619070 | 7rhkUASD... |
| 4 | Bht3rxNx... | No | 1,140.99-3,043.00 | 127428804445385 | 9H7fxXPJ... |
| 5 | 4HMnVsRt... | Yes | 4,177.98-4,668.43 | 33527895441872 | G1Rz7beZ... |
| 6 | H4J6RfpN... | No | 4,365.91-4,825.05 | 711405522686 | DmQVU6rw... |
| 7 | 6YCcYF2o... | No | 4,339.79-4,796.19 | 275163663215 | 46hHVpRw... |
| 8 | HUxJU6rZ... | Yes | 3,922.90-4,791.39 | 176969624346 | B4WdJE57... |
| 9 | 5vonichV... | Yes | 3,104.47-4,553.17 | 150791364196 | 5V5jY8NM... |
| 10 | hFQzh5vM... | No | 4,318.15-4,878.41 | 69484994030 | 8cPza6iF... |

## Positions Owned by Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6

### Total Positions: 4

### Total Liquidity: 727138861314537
### Active Liquidity: 599710056869152

| # | Active | Tick Range | Price Range | Liquidity | Fees Owed | NFT Mint |
|---|--------|------------|-------------|-----------|-----------|----------|
| 1 | Yes | 82970-84980 | 4,010.16-4,902.87 | 285990575733336 | None | tdRWo41BCMYSTBnQECx9cqFCNaU5gutm9NEH4sY6dmr |
| 2 | Yes | 83310-85330 | 4,148.84-5,077.50 | 159921308516746 | None | 9gZFyaQRnrgDt53z8FqKrqMsJyHcLoRUSKMmNRF4K9k9 |
| 3 | Yes | 82440-86520 | 3,803.16-5,719.10 | 153798172619070 | None | 7rhkUASDE2fpPaZTPpBLABJGe7P6jamUGYpBCiUpYKKG |
| 4 | No | 70400-80210 | 1,140.99-3,043.00 | 127428804445385 | None | 9H7fxXPJG4sJ8MCD4rfwnXqJD3jpLQ2VZr6Gk51fh6eG |

## Top Liquidity Providers

| Rank | Owner | Positions | Total Liquidity | Share |
|------|-------|-----------|-----------------|-------|
| 1 | Bht3rxNxJ3Ym8JBJfVSfm1Zb6FnJutm1PS17o84yEGm6 | 4 | 727138861314537 | 95.42% |
| 2 | 4HMnVsRtATXcczkhp2H3cu5SaZYBpBtkxxJF7qjsL3R5 | 1 | 33527895441872 | 4.40% |
| 3 | H4J6RfpNwCH5GvuGm21jQaLdQgQ35M5TPc1vqMrVSfEq | 1 | 711405522686 | 0.09% |
| 4 | 6YCcYF2oKR8vqFaJTZT2fWMerKnW5YKBU8ePz6WpkoKe | 1 | 275163663215 | 0.04% |
| 5 | HUxJU6rZ1ZiuRVoeML2ecAKuJAMu8y9z533DT93tT3YK | 1 | 176969624346 | 0.02% |
| 6 | 5vonichVXVELjPuvLdRbBu3tBL44btJyJ18nuaJMiREA | 1 | 150791364196 | 0.02% |
| 7 | hFQzh5vM6R8eAT2qV2iUE1Wn1vLjPibC87QBK7rKhor | 1 | 69484994030 | 0.01% |

## Volume and Fees

### Cumulative Volume

| Direction | Token 0 (SOL) | Token 1 (FRAGME) |
|-----------|---------------|------------------|
| Swap In | 3807.226200094 | 14219457.471899152 |
| Swap Out | 3166.134568583 | 17001629.700014127 |

### Fees Collected

| Type | Token 0 (SOL) | Token 1 (FRAGME) |
|------|---------------|------------------|
| Total Fees | 0 | 0 |
| Claimed Fees | 14.00897536 | 0 |
| Unclaimed Fees | -14.00897536 | 0 |
| Protocol Fees | 0.913732634 | 3412.669792831 |

---

Report generated at 8/18/2025, 11:38:45 PM
