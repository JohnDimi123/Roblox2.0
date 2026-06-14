// Keyboard + mouse input with pointer-lock mouselook for the 3D engine.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.justPressed = new Set();
    this._mouseDown = false;
    this.clickHandlers = [];

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.justPressed.add(k);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    };
    this._onWheel = (e) => { this.wheel += e.deltaY; };
    this._onClick = () => {
      if (!this.locked) { this.dom.requestPointerLock?.(); return; }
      for (const h of this.clickHandlers) h();
    };
    this._onMouseDown = () => { this._mouseDown = true; };
    this._onMouseUp = () => { this._mouseDown = false; };
    this._onLockChange = () => { this.locked = document.pointerLockElement === this.dom; };
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    this.dom.addEventListener('click', this._onClick);
    this.dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    this.dom.removeEventListener('click', this._onClick);
    this.dom.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.exitLock();
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  onClick(fn) { this.clickHandlers.push(fn); }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  get mouseDown() { return this._mouseDown; }

  // call once per frame after reading
  endFrame() {
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.justPressed.clear();
  }
}
