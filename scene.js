import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

class Scene {
    constructor() {
        this.container = document.getElementById('scene-container');
        this.loadingScreen = document.querySelector('.loading-screen');
        
        // Set up loading manager
        this.loadingManager = new THREE.LoadingManager(
            // Called when everything is loaded
            () => {
                this.loadingScreen.classList.add('hidden');
            },
            // Called while loading is progressing
            (url, itemsLoaded, itemsTotal) => {
                const progress = (itemsLoaded / itemsTotal * 100).toFixed(0);
                const loadingText = this.loadingScreen.querySelector('p');
                loadingText.textContent = `Loading MacBook... ${progress}%`;
            }
        );

        this.createScene();
        this.setupCamera();
        this.setupLights();
        this.setupControls();
        this.setupResizing();
        this.loadMacbook();
        this.setupDragAndDrop();
        this.animate();
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // Position camera directly above, but closer
        this.camera.position.set(0, 2.7, 0);
        this.camera.lookAt(0, 0, 0);
    }

    setupLights() {
        // Main directional light (simulating sunlight)
        const mainLight = new THREE.DirectionalLight(0xffffff, 2);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 20;
        this.scene.add(mainLight);

        // Soft ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add rim light for better edge definition
        const rimLight = new THREE.DirectionalLight(0xffffff, 1);
        rimLight.position.set(-5, 5, -5);
        this.scene.add(rimLight);

        // Add a subtle purple accent light
        const accentLight = new THREE.DirectionalLight(0x7047B3, 0.3);
        accentLight.position.set(0, -5, 5);
        this.scene.add(accentLight);
    }

    loadMacbook() {
        // Set up loaders
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

        const gltfLoader = new GLTFLoader(this.loadingManager);
        gltfLoader.setDRACOLoader(dracoLoader);

        // Load the model
        gltfLoader.load(
            'models/macbook.glb',
            (gltf) => {
                this.macbook = gltf.scene;
                
                // Position MacBook flat on desk
                this.macbook.scale.set(5, 5, 5);
                this.macbook.rotation.x = 0; // Flat
                this.macbook.rotation.y = 0; // Rotate 180 degrees from previous position
                this.macbook.position.set(0, 0, 0); // At origin (adjust when desk is added)
                
                // Create arrays to store components by their parent
                const componentsByParent = new Map();
                
                // First pass: group components by parent
                this.macbook.traverse((child) => {
                    if (child.isMesh) {
                        const parentName = child.parent ? child.parent.name : 'no parent';
                        if (!componentsByParent.has(parentName)) {
                            componentsByParent.set(parentName, []);
                        }
                        componentsByParent.get(parentName).push(child);
                        
                        // Set material properties
                        if (child.material) {
                            child.material.roughness = 0.4;
                            child.material.metalness = 0.8;
                            child.material.envMapIntensity = 1.5;
                            
                            if (!this.envMap) {
                                const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                                this.envMap = pmremGenerator.fromScene(new THREE.Scene()).texture;
                                pmremGenerator.dispose();
                            }
                            child.material.envMap = this.envMap;
                        }
                        
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Find the top-most components (likely the lid)
                let highestY = -Infinity;
                let lidParentName = '';
                let lowestY = Infinity;
                
                componentsByParent.forEach((components, parentName) => {
                    components.forEach(mesh => {
                        const worldPos = new THREE.Vector3();
                        mesh.getWorldPosition(worldPos);
                        if (worldPos.y > highestY) {
                            highestY = worldPos.y;
                            lidParentName = parentName;
                        }
                        if (worldPos.y < lowestY) {
                            lowestY = worldPos.y;
                        }
                    });
                });
                
                // Set lid components and main lid mesh
                this.lidComponents = componentsByParent.get(lidParentName) || [];
                console.log('Found lid components:', this.lidComponents.length, 'with parent:', lidParentName);
                
                // Create a pivot point for the lid
                this.lidPivot = new THREE.Object3D();
                this.macbook.add(this.lidPivot);
                
                // Position the pivot at the hinge point (back edge of base)
                const hingeY = -0.0047; // Height of the pivot
                const hingeZ = -0.114; // Depth of the pivot
                this.lidPivot.position.set(0, hingeY, hingeZ);
                this.lidPivot.rotation.order = 'YXZ'; // Set rotation order
                
                // Move lid components to be children of the pivot
                if (this.lidComponents.length > 0) {
                    let maxArea = -Infinity;
                    this.lidComponents.forEach(mesh => {
                        // Reparent to pivot
                        this.lidPivot.attach(mesh);
                        
                        if (mesh.geometry && mesh.geometry.boundingSphere) {
                            const area = Math.PI * Math.pow(mesh.geometry.boundingSphere.radius, 2);
                            if (area > maxArea) {
                                maxArea = area;
                                this.lidMesh = mesh;
                            }
                        }
                    });
                }

                // Initialize in closed state
                this.isLidOpen = false;
                if (this.lidPivot) {
                    this.lidPivot.rotation.x = Math.PI * 0.61; // Start closed
                }

                this.scene.add(this.macbook);
                
                // Remove the temporary plane if it exists
                if (this.laptop) {
                    this.scene.remove(this.laptop);
                }

                // Set up camera for desk view
                this.camera.position.set(0, 2.7, 0); // Position directly above, but closer
                this.camera.lookAt(0, 0, 0);

                // Setup keyboard controls
                this.setupKeyboardControls();
                this.setupRevealButton();
            },
            (progress) => {
                console.log('Loading model:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
            }
        );
    }

    setupControls() {
        // Remove orbit controls - camera will stay fixed
        this.camera.position.set(0, 2.7, 0);
        this.camera.lookAt(0, 0, 0);
    }

    setupResizing() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupDragAndDrop() {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Event listeners for sticker dragging
        const stickers = document.querySelectorAll('.sticker');
        stickers.forEach(sticker => {
            sticker.addEventListener('dragstart', this.handleDragStart.bind(this));
            sticker.addEventListener('dragend', this.handleDragEnd.bind(this));
        });

        this.renderer.domElement.addEventListener('dragover', this.handleDragOver.bind(this));
        this.renderer.domElement.addEventListener('drop', this.handleDrop.bind(this));
    }

    handleDragStart(event) {
        event.dataTransfer.setData('text/plain', event.target.querySelector('img').src);
        event.dataTransfer.effectAllowed = 'copy';
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    handleDragEnd(event) {
        event.preventDefault();
    }

    handleDrop(event) {
        event.preventDefault();
        if (!this.macbook || !this.lidMesh) return;

        const stickerUrl = event.dataTransfer.getData('text/plain');
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Only check intersection with the lid mesh
        const intersects = this.raycaster.intersectObject(this.lidMesh, true);

        if (intersects.length > 0) {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(stickerUrl, (texture) => {
                // Create a plane instead of a sprite for better rotation handling
                const geometry = new THREE.PlaneGeometry(1, 1);
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    depthTest: true,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                    alphaTest: 0.1
                });
                const sticker = new THREE.Mesh(geometry, material);
                
                // Make stickers much larger (20x the previous size)
                const fixedScale = 6.0; // Increased from 0.3 to 6.0
                sticker.scale.set(fixedScale, fixedScale, fixedScale);
                
                // Position the sticker at the intersection point
                const point = intersects[0].point.clone();
                // Convert world position to local position relative to the lid
                const localPoint = this.lidMesh.worldToLocal(point);
                sticker.position.copy(localPoint);
                
                // Set rotation for closed lid position
                sticker.rotation.x = -0.35;
                sticker.rotation.y = -Math.PI;
                sticker.rotation.z = Math.PI; // Add 180-degree rotation around Z-axis
                
                // Add a small offset to prevent z-fighting
                sticker.position.add(new THREE.Vector3(0, 0, -0.01));
                
                // Add the sticker as a child of the lid mesh
                this.lidMesh.add(sticker);
            });
        }
    }

    setupKeyboardControls() {
        // Empty implementation - we're using the button instead
    }

    setupRevealButton() {
        // Create and style the reveal button
        const revealButton = document.createElement('button');
        revealButton.textContent = 'Open MacBook';
        revealButton.style.position = 'fixed';
        revealButton.style.bottom = '160px'; // Increased from 120px to move higher above stickers bar
        revealButton.style.left = '50%';
        revealButton.style.transform = 'translateX(-50%)';
        revealButton.style.padding = '10px 20px';
        revealButton.style.fontSize = '16px';
        revealButton.style.backgroundColor = '#7047B3';
        revealButton.style.color = 'white';
        revealButton.style.border = 'none';
        revealButton.style.borderRadius = '5px';
        revealButton.style.cursor = 'pointer';
        revealButton.style.transition = 'background-color 0.3s';
        revealButton.style.zIndex = '1000'; // Ensure button is above other elements

        // Add hover effect
        revealButton.addEventListener('mouseenter', () => {
            revealButton.style.backgroundColor = '#5835A0';
        });
        revealButton.addEventListener('mouseleave', () => {
            revealButton.style.backgroundColor = '#7047B3';
        });

        // Add click handler
        revealButton.addEventListener('click', () => {
            if (!this.isLidOpen) {
                this.toggleLid();
                // Here you can add code to transition to the website
                revealButton.style.display = 'none'; // Hide button after opening
            }
        });

        document.body.appendChild(revealButton);
    }

    toggleLid() {
        if (!this.lidPivot || this.lidAnimationInProgress) return;

        this.lidAnimationInProgress = true;
        const duration = 1000; // Animation duration in milliseconds
        const startTime = performance.now();

        // Store initial and target rotations
        const startRotation = this.lidPivot.rotation.x;
        const targetRotation = this.isLidOpen ? Math.PI * 0.61 : 0; // Close to about 80% closed

        const animateLid = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Use easing function for smooth animation
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            // Update pivot rotation
            this.lidPivot.rotation.x = startRotation + (targetRotation - startRotation) * easeProgress;

            if (progress < 1) {
                requestAnimationFrame(animateLid);
            } else {
                this.lidAnimationInProgress = false;
                this.isLidOpen = !this.isLidOpen;
            }
        };

        requestAnimationFrame(animateLid);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.renderer.render(this.scene, this.camera);
    }
}

// Create the scene when the page loads
window.addEventListener('load', () => {
    new Scene();
}); 