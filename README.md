
## VTS - Vehicle Tracking System

Basically, *Vehicle Tracking System* is aimed to support various GPS hardware devices and different data protocols.
Both binary and string-based protocols can be supported, including NMEA-like ones.

There is a map page available to see your GPS devices tracked in real-time.
Just go to configured HTTP endpoint in your browser.

**TBD:** Also, some admin UI provided to get an idea what's going on under the hood,
with some of logs out to see in real-time in your browser.

Main goals are to keep it:
- lightweight
- extensible
- configurable
- easy-to-use

...and that's it. Simple.

## How to use

### as standalone server

After cloning or downloading this repository, you can run it as standalone server:

```
npm install
node server.js
```

See `server.js` for usage example.
