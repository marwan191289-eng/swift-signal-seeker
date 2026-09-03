# Swift Signal Seeker

import pandas as pd

import talib

import matplotlib.pyplot as plt

# اختار الفريم هنا: "M1" أو "M5"

TIMEFRAME = "M1"  # غيّرها إلى "M5" وقت ما تحب

# ربط الفريم باسم ملف CSV

file_map = {

    "M1": "VOL_80_M1.csv",

    "M5": "VOL_80_M5.csv"

}

csv_file = file_map[TIMEFRAME]

print(f"📂 جاري استخدام الملف: {csv_file} للفريم: {TIMEFRAME}")

# استيراد البيانات

data = pd.read_csv(csv_file)

data['time'] = pd.to_datetime(data['time'])

# مؤشرات سكالبينج سريعة

data['EMA9'] = talib.EMA(data['close'], timeperiod=9)

data['EMA21'] = talib.EMA(data['close'], timeperiod=21)

data['RSI'] = talib.RSI(data['close'], timeperiod=7)

data['ATR'] = talib.ATR(data['high'], data['low'], data['close'], timeperiod=7)

# توليد الإشارات

data['Signal'] = 'Hold'

data.loc[(data['EMA9'] > data['EMA21']) & (data['RSI'] > 60), 'Signal'] = 'Buy'

data.loc[(data['EMA9'] < data['EMA21']) & (data['RSI'] < 40), 'Signal'] = 'Sell'

# عرض آخر 20 شمعة مع الإشارة

print("\n📊 آخر الإشارات:")

print(data[['time', 'close', 'EMA9', 'EMA21', 'RSI', 'ATR', 'Signal']].tail(20))

# رسم بسيط

plt.figure(figsize=(12,6))

plt.plot(data['time'], data['close'], label='Price', color='blue')

plt.plot(data['time'], data['EMA9'], label='EMA9', color='orange')

plt.plot(data['time'], data['EMA21'], label='EMA21', color='red')

plt.title(f"VOL_80 - Signals ({TIMEFRAME})")

plt.legend()

plt.tight_layout()

plt.show()

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d0c29082-0da6-4ae4-9d88-68fc4418830c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
