import { Spherical, Vector3 } from 'three';

const keys = new Map([
    ['ArrowLeft', 'orbit-left'],
    ['ArrowUp', 'orbit-up'],
    ['ArrowDown', 'orbit-down'],
    ['ArrowRight', 'orbit-right'],
    ['a', 'move-left'],
    ['e', 'move-up'],
    ['q', 'move-down'],
    ['d', 'move-right'],
    ['w', 'move-forward'],
    ['s', 'move-back'],
]);

const orbitSpeed = 1.5;
const tapDuration = 0.08;

export function bindNavigation(panel, camera, controls, requestRender) {
    const pressedKeys = new Map();
    const pressedPointers = new Map();
    const orbit = new Spherical();
    const offset = new Vector3();
    const direction = new Vector3();
    const right = new Vector3();
    const up = new Vector3();
    const movement = new Vector3();
    let lastFrame;

    function step(actions, seconds) {
        const sideways = Number(actions.has('move-right')) - Number(actions.has('move-left'));
        const vertical = Number(actions.has('move-up')) - Number(actions.has('move-down'));
        const depth = Number(actions.has('move-forward')) - Number(actions.has('move-back'));
        if (sideways || vertical || depth) {
            direction.subVectors(controls.target, camera.position).normalize();
            right.crossVectors(direction, camera.up).normalize();
            up.crossVectors(right, direction);
            movement.copy(right).multiplyScalar(sideways)
                .addScaledVector(up, vertical).addScaledVector(direction, depth);
            // A close-up needs smaller steps than the overview.
            movement.normalize().multiplyScalar(controls.getDistance() * seconds);
            camera.position.add(movement);
            controls.target.add(movement);
        }

        const azimuth = Number(actions.has('orbit-right')) - Number(actions.has('orbit-left'));
        const elevation = Number(actions.has('orbit-down')) - Number(actions.has('orbit-up'));
        if (azimuth || elevation) {
            offset.subVectors(camera.position, controls.target);
            orbit.setFromVector3(offset);
            orbit.theta += azimuth * orbitSpeed * seconds;
            orbit.phi += elevation * orbitSpeed * seconds;
            camera.position.copy(controls.target).add(offset.setFromSpherical(orbit.makeSafe()));
        }
    }

    function tap(action) {
        step(new Set([action]), tapDuration);
        requestRender();
    }

    window.addEventListener('keydown', event => {
        const action = keys.get(event.key) ?? keys.get(event.key.toLowerCase());
        if (!action || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
        event.preventDefault();
        if (event.repeat) return;
        pressedKeys.set(event.code || event.key.toLowerCase(), action);
        tap(action);
    });
    window.addEventListener('keyup', event => pressedKeys.delete(event.code || event.key.toLowerCase()));

    panel.addEventListener('pointerdown', event => {
        const button = event.target.closest('button[data-camera-action]');
        if (!button || event.button !== 0) return;
        button.setPointerCapture(event.pointerId);
        const action = button.dataset.cameraAction;
        pressedPointers.set(event.pointerId, action);
        tap(action);
    });

    for (const eventType of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        panel.addEventListener(eventType, event => pressedPointers.delete(event.pointerId));
    }
    panel.addEventListener('click', event => {
        // Enter, Space and assistive technology activate a button without a pointer.
        const button = event.target.closest('button[data-camera-action]');
        if (button && event.detail === 0) tap(button.dataset.cameraAction);
    });

    window.addEventListener('blur', () => {
        pressedKeys.clear();
        pressedPointers.clear();
        lastFrame = undefined;
    });

    return time => {
        if (!pressedKeys.size && !pressedPointers.size) {
            lastFrame = undefined;
            return;
        }

        if (lastFrame !== undefined) {
            const actions = new Set([...pressedKeys.values(), ...pressedPointers.values()]);
            step(actions, Math.min((time - lastFrame) / 1000, 0.05));
        }
        lastFrame = time;
        requestRender();
    };
}
