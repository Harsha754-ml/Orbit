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
            center = { x: 0, y: 0 },
            rotationOffset = -Math.PI / 2 // Start at top
        } = options;

        const positions = [];
        
        // Multi-ring Strategy for large item counts
        // 1-8 items: 1 ring
        // 9-20 items: 2 rings
        // 20+ items: 3 rings
        const rings = [];
        if (itemCount <= 8) {
            rings.push({ count: itemCount, radius: baseRadius });
        } else if (itemCount <= 18) {
            const innerCount = Math.floor(itemCount * 0.4);
            const outerCount = itemCount - innerCount;
            rings.push({ count: innerCount, radius: baseRadius * 0.6 });
            rings.push({ count: outerCount, radius: baseRadius + (outerCount - 8) * 4 });
        } else {
            const innerCount = Math.floor(itemCount * 0.2);
            const midCount = Math.floor(itemCount * 0.35);
            const outerCount = itemCount - innerCount - midCount;
            rings.push({ count: innerCount, radius: baseRadius * 0.5 });
            rings.push({ count: midCount, radius: baseRadius * 1.0 });
            rings.push({ count: outerCount, radius: baseRadius * 1.6 });
        }

        let processedItems = 0;
        rings.forEach((ring, ringIdx) => {
            const angleStep = (2 * Math.PI) / ring.count;
            const ringOffset = rotationOffset + (ringIdx * (Math.PI / 8)); // Slight stagger per ring

            for (let i = 0; i < ring.count; i++) {
                if (processedItems >= itemCount) break;
                const angle = ringOffset + (i * angleStep);
                positions.push({
                    x: center.x + Math.cos(angle) * ring.radius,
                    y: center.y + Math.sin(angle) * ring.radius,
                    angle: angle,
                    radius: ring.radius,
                    ring: ringIdx
                });
                processedItems++;
            }
        });

        return {
            radius: rings[rings.length - 1].radius,
            positions
        };
    }
}

module.exports = new LayoutEngine();
