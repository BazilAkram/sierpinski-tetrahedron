const baseRadius = 2 * Math.SQRT2 / 3;
const baseHalfWidth = Math.sqrt(2 / 3);

export const corners = [
    [0, 1, 0],
    [0, -1 / 3, baseRadius],
    [baseHalfWidth, -1 / 3, -baseRadius / 2],
    [-baseHalfWidth, -1 / 3, -baseRadius / 2],
];

export const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
];

export function fillCenters(centers, order) {
    centers.fill(0, 0, 3);
    let count = 1;

    for (let depth = 1; depth <= order; depth++) {
        const childScale = 2 ** -depth;

        // Expand backward so children never overwrite a parent we still need.
        for (let parent = count - 1; parent >= 0; parent--) {
            const offset = parent * 3;
            const x = centers[offset];
            const y = centers[offset + 1];
            const z = centers[offset + 2];

            // Scaling the parent by 1/2 around each corner leaves that corner fixed.
            for (let corner = 0; corner < corners.length; corner++) {
                const [dx, dy, dz] = corners[corner];
                const child = (parent * corners.length + corner) * 3;
                centers[child] = x + childScale * dx;
                centers[child + 1] = y + childScale * dy;
                centers[child + 2] = z + childScale * dz;
            }
        }

        count *= corners.length;
    }

    return count;
}

export function findSurfaceDistance(origin, direction, order) {
    // Each face has outward normal -corner, where corner is the opposite vertex.
    const start = corners.map(([x, y, z]) => -(x * origin.x + y * origin.y + z * origin.z));
    const speed = corners.map(([x, y, z]) => -(x * direction.x + y * direction.y + z * direction.z));
    let nearest = Infinity;

    function visit(x, y, z, radius, depth) {
        let enter = 0;
        let exit = nearest;

        // Clip the ray against the four face planes to discard entire branches.
        for (let i = 0; i < corners.length; i++) {
            const [dx, dy, dz] = corners[i];
            const gap = radius / 3 - (start[i] + dx * x + dy * y + dz * z);
            if (Math.abs(speed[i]) < 1e-12) {
                if (gap < 0) return;
                continue;
            }

            const distance = gap / speed[i];
            if (speed[i] < 0) enter = Math.max(enter, distance);
            else exit = Math.min(exit, distance);
            if (enter > exit) return;
        }

        if (depth === order) {
            if (enter > 0) nearest = enter;
            return;
        }

        const half = radius / 2;
        for (const [dx, dy, dz] of corners) {
            visit(x + half * dx, y + half * dy, z + half * dz, half, depth + 1);
        }
    }

    visit(0, 0, 0, 1, 0);
    return nearest;
}
