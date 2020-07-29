import {
  registerCanvas,
  registerCanvas2D,
  dispatchTouchStart,
  dispatchTouchMove,
  dispatchTouchEnd
} from "@alipay/o3-adapter-miniprogram/dist/miniprogram";

import * as o3 from "@alipay/o3/dist/miniprogram";

Component({
  props: {
    onLoad: () => {}
  },
  methods: {
    onTouchStart(e) {
      dispatchTouchStart(e);
    },
    onTouchMove(e) {
      dispatchTouchMove(e);
    },
    onTouchEnd(e) {
      dispatchTouchEnd(e);
    },
    onCanvasReady() {
      const ctx2D = my.createCanvasContext("canvas2D");
      registerCanvas2D(ctx2D, "canvas2D");
      my._createCanvas({
        id: "canvas",
        success: canvas => {
          if (canvas) {
            registerCanvas(canvas, "canvas");
            this.props.onLoad(o3, canvas);
          } else {
            if (this.props.onError) {
              this.props.onError();
            }
          }
        }
      });
    }
  }
});
