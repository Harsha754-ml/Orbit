/**
 * Orbit Plugin: Weather
 * Fetches current weather from wttr.in (no API key needed) and shows it in a widget.
 * Refreshes every 15 minutes. Falls back gracefully on network errors.
 */

const https = require('https');

const name = 'Weather';
const description = 'Live local weather conditions — no API key required';
const version = '1.0.0';

const WEATHER_CODES = {
    113: '☀️ Sunny',       116: '⛅ Partly Cloudy', 119: '☁️ Cloudy',
    122: '🌫️ Overcast',   143: '🌫️ Mist',          176: '🌦️ Patchy Rain',
    179: '🌨️ Patchy Snow', 182: '🌧️ Sleet',         185: '🌧️ Sleet',
    200: '⛈️ Thundery',   227: '🌨️ Blowing Snow',  230: '❄️ Blizzard',
    248: '🌫️ Fog',        260: '🌫️ Freezing Fog',   263: '🌦️ Drizzle',
    266: '🌧️ Drizzle',    281: '🌧️ Sleet',          284: '🌧️ Sleet',
    293: '🌦️ Light Rain', 296: '🌧️ Light Rain',     299: '🌧️ Rain',
    302: '🌧️ Rain',       305: '🌧️ Heavy Rain',     308: '🌧️ Heavy Rain',
    311: '🌧️ Sleet',      314: '🌧️ Sleet',          317: '🌧️ Sleet',
    320: '🌨️ Snow',       323: '🌨️ Light Snow',     326: '🌨️ Light Snow',
    329: '❄️ Snow',        332: '❄️ Snow',            335: '❄️ Heavy Snow',
    338: '❄️ Heavy Snow',  350: '🌧️ Ice Pellets',    353: '🌦️ Shower',
    356: '🌧️ Rain Shower', 359: '🌧️ Torrential Rain', 362: '🌧️ Sleet Shower',
    365: '🌧️ Sleet',      368: '🌨️ Snow Shower',    371: '❄️ Snow Shower',
    374: '🌧️ Ice Shower', 377: '🌧️ Ice Pellets',    386: '⛈️ Thundery Shower',
    389: '⛈️ Thundery',   392: '⛈️ Thundery Snow',   395: '❄️ Blizzard'
};

function fetchWeather(callback) {
    const req = https.get(
        'https://wttr.in/?format=j1',
        { headers: { 'User-Agent': 'OrbitApp/2.0' }, timeout: 10000 },
        (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    const j = JSON.parse(raw);
                    const cur = j.current_condition[0];
                    const area = j.nearest_area[0];
                    const code = parseInt(cur.weatherCode, 10);
                    callback(null, {
                        city:       area.areaName[0].value,
                        country:    area.country[0].value,
                        condition:  WEATHER_CODES[code] || cur.weatherDesc[0].value,
                        tempC:      cur.temp_C,
                        feelsLike:  cur.FeelsLikeC,
                        humidity:   cur.humidity,
                        windKmph:   cur.windspeedKmph
                    });
                } catch (e) {
                    callback(new Error('Parse error'));
                }
            });
        }
    );
    req.on('error', callback);
    req.on('timeout', () => { req.destroy(); callback(new Error('Timeout')); });
}

function init(api) {
    api.registerAction({
        type: 'command',
        label: 'Weather',
        icon: 'web.svg',
        command: 'ui:toggle-widget-weather'
    });

    function refresh() {
        fetchWeather((err, data) => {
            if (err) {
                api.broadcast('weather-update', { error: 'Unable to fetch weather' });
                api.logger.warn('fetch_failed', { err: err.message });
                return;
            }
            api.broadcast('weather-update', data);
            api.logger.info('updated', { city: data.city, temp: data.tempC });
        });
    }

    // Initial fetch after 2s (allow app to fully start)
    setTimeout(refresh, 2000);

    // Refresh every 15 minutes
    api.schedule(refresh, 15 * 60 * 1000);

    api.logger.info('started');
}

module.exports = { name, description, version, init };
