const { screen } = require('electron');

function getCursorPositionScaled() {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);

    // We use display.bounds for absolute positioning and workArea for constraints
    return {
        x: Math.round(point.x),
        y: Math.round(point.y),
        display: {
            bounds: display.bounds,
            workArea: display.workArea,
            scaleFactor: display.scaleFactor
        }
    };
}

module.exports = { getCursorPositionScaled };
