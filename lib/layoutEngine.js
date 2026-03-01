/**
 * Orbit Adaptive Layout Engine
 * Computes positions algorithmically based on item count and context.
 */
class LayoutEngine {
    constructor() {
        this.baseRadius = 100;
        this.minSpacing = 40; // min pixels between centers
    }

    computePositions(itemCount, options = {}) {
        const {
            baseRadius = 100,
            isNested = false,
            center = { x: 0, y: 0 },
            rotationOffset = -Math.PI / 2 // Start at top
        } = options;

        // Adaptive Radius: Increases as item count grows to prevent crowding
        // For < 8 items, use base. For > 8, expand 5px per item
        const radius = itemCount <= 8 
            ? baseRadius 
            : baseRadius + (itemCount - 8) * 8;

        const positions = [];
        const angleStep = (2 * Math.PI) / itemCount;

        for (let i = 0; i < itemCount; i++) {
            const angle = rotationOffset + (i * angleStep);
            positions.push({
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius,
                angle: angle,
                radius: radius
            });
        }

        return {
            radius,
            positions
        };
    }
}

module.exports = new LayoutEngine();
