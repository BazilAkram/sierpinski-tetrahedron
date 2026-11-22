import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'dat.gui';
import { corners, faces, fillCenters, findSurfaceDistance } from './sierpinski.js';
import { bindNavigation } from './navigation.js';

const maxOrder = 10;
const batchDepth = 3;
const singleBatchLimit = 6;
const batchRadius = 2 ** -batchDepth;
const params = { order: 3 };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

camera.position.set(2, 1.4, 2.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.zoomToCursor = true;
controls.zoomSpeed = 2;
controls.minDistance = 2 ** -maxOrder;
controls.maxDistance = 10;

const positions = [];
const barycentrics = [];
for (const face of faces) {
    face.forEach((corner, vertex) => {
        positions.push(...corners[corner]);
        barycentrics.push(Number(vertex === 0), Number(vertex === 1), Number(vertex === 2));
    });
}

const geometries = new Map();
const barycentricAttribute = new THREE.Float32BufferAttribute(barycentrics, 3);
const unitBounds = new THREE.Sphere(new THREE.Vector3(), 1);

function geometryFor(order) {
    if (geometries.has(order)) return geometries.get(order);

    const centers = new Float32Array(3 * corners.length ** order);
    const scale = 2 ** -order;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.instanceCount = fillCenters(centers, order);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map(value => value * scale), 3));
    geometry.setAttribute('barycentric', barycentricAttribute);
    geometry.setAttribute('instanceCenter', new THREE.InstancedBufferAttribute(centers, 3));
    geometry.boundingSphere = unitBounds;
    geometry.userData.order = order;
    geometries.set(order, geometry);
    return geometry;
}

const material = new THREE.ShaderMaterial({
    vertexShader: `
        attribute vec3 instanceCenter;
        attribute vec3 barycentric;
        varying vec3 faceCoordinates;

        void main() {
            faceCoordinates = barycentric;
            vec3 point = instanceCenter + position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 faceCoordinates;

        void main() {
            // Shade triangle edges in the same draw as the faces. Fade the
            // outline as triangles become too small to resolve it clearly.
            vec3 pixelWidth = max(fwidth(faceCoordinates), vec3(0.0001));
            vec3 edgeDistances = faceCoordinates / pixelWidth;
            float distance = min(edgeDistances.x, min(edgeDistances.y, edgeDistances.z));
            float width = max(pixelWidth.x, max(pixelWidth.y, pixelWidth.z));
            float outline = (1.0 - smoothstep(0.25, 1.25, distance))
                * (1.0 - smoothstep(0.18, 0.5, width));
            gl_FragColor = vec4(vec3(mix(1.0, 0.0, outline)), 1.0);
            #include <colorspace_fragment>
        }
    `,
});

const root = new THREE.Mesh(geometryFor(0), material);
const branches = new THREE.Group();
const branchCenters = new Float32Array(3 * corners.length ** batchDepth);
fillCenters(branchCenters, batchDepth);

// Each branch reuses the same local geometry. Three.js can cull it separately.
for (let offset = 0; offset < branchCenters.length; offset += 3) {
    const branch = new THREE.Mesh(root.geometry, material);
    branch.position.fromArray(branchCenters, offset);
    branch.scale.setScalar(batchRadius);
    branches.add(branch);
}
scene.add(root, branches);

let framePending = false;
const viewPosition = new THREE.Vector3();

function requestRender() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(render);
}

function render(time) {
    framePending = false;
    updateNavigation(time);
    controls.update();
    const near = Math.min(0.1, controls.getDistance() * 0.02);
    if (camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
    }

    root.visible = params.order <= singleBatchLimit;
    branches.visible = !root.visible;
    if (root.visible) {
        root.geometry = geometryFor(params.order);
    } else {
        camera.updateMatrixWorld();
        const focalPixels = camera.projectionMatrix.elements[5] * renderer.domElement.height / 2;
        for (const branch of branches.children) {
            viewPosition.copy(branch.position).applyMatrix4(camera.matrixWorldInverse);
            const nearestDepth = Math.max(camera.near, -viewPosition.z - batchRadius);
            const diameterPixels = 2 * batchRadius * focalPixels / nearestDepth;
            // Stop subdividing when the current copies are smaller than a pixel.
            const visibleOrder = Math.max(0, Math.ceil(Math.log2(diameterPixels)));
            branch.geometry = geometryFor(Math.min(params.order - batchDepth, visibleOrder));
        }
    }

    renderer.render(scene, camera);
}

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    requestRender();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const localOrigin = new THREE.Vector3();

function focusPiece(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
        2 * (event.clientX - bounds.left) / bounds.width - 1,
        1 - 2 * (event.clientY - bounds.top) / bounds.height,
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const { ray } = raycaster;
    let distance = Infinity;
    if (root.visible) {
        distance = findSurfaceDistance(ray.origin, ray.direction, root.geometry.userData.order);
    } else {
        for (const branch of branches.children) {
            localOrigin.copy(ray.origin).sub(branch.position).divideScalar(batchRadius);
            const localDistance = findSurfaceDistance(localOrigin, ray.direction, branch.geometry.userData.order);
            distance = Math.min(distance, localDistance * batchRadius);
        }
    }

    if (Number.isFinite(distance)) {
        ray.at(distance, controls.target);
        controls.update();
        requestRender();
    }
}

const gui = new GUI();
const actions = { resetView: () => controls.reset() };
const updateNavigation = bindNavigation(document.querySelector('.camera-navigation'), camera, controls, requestRender);
gui.add(params, 'order', 0, maxOrder, 1).name('Recursion Order').onChange(requestRender);
gui.add(actions, 'resetView').name('Reset View');
controls.addEventListener('change', requestRender);
renderer.domElement.addEventListener('dblclick', focusPiece);
window.addEventListener('resize', resize);
resize();
