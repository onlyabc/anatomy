/**
 * 自定义全息显示片元着色器（基于 holoplay-core Shader）
 * - DPI≈332 横屏 / 竖屏（8.4 寸竖屏已测试）
 * - DPI≈359 竖屏（13.3 寸竖屏，待实机验证）
 */

function glslifyNumbers(strings: TemplateStringsArray, ...values: unknown[]) {
  let s = strings[0];
  for (let i = 1; i < strings.length; ++i) {
    const v = values[i - 1];
    s += typeof v === "number" ? v.toPrecision(10) : String(v);
    s += strings[i];
  }
  return s;
}

/** 生成全息编码片元着色器源码，cfg 来自 HoloDisplayConfig */
export function Shader(cfg: any) {
  const dpi = glslifyNumbers`${cfg.DPI}`;
  const pitch = glslifyNumbers`${cfg.pitch}`;
  const slope = glslifyNumbers`${cfg.tilt}`;
  const center = glslifyNumbers`${cfg.calibration.center.value}`;
  const subp = glslifyNumbers`${cfg.subp}`;
  const tileCount = glslifyNumbers`${cfg.numViews}`;
  const tilesX = glslifyNumbers`${cfg.quiltWidth}`;
  const tilesY = glslifyNumbers`${cfg.quiltHeight}`;
  const subpixelCellCount = `${Math.round(cfg.calibration.subpixelCells.length)}`;
  const cellPatternType = `${Math.round(cfg.subpixelMode)}`;
  const framebufferWidth = glslifyNumbers`${cfg.framebufferWidth}`;
  const framebufferHeight = glslifyNumbers`${cfg.framebufferHeight}`;
  const tileHeight = glslifyNumbers`${cfg.tileHeight}`;
  const tileWidth = glslifyNumbers`${cfg.tileWidth}`;
  const quiltWidth = glslifyNumbers`${cfg.quiltWidth}`;
  const quiltHeight = glslifyNumbers`${cfg.quiltHeight}`;
  const screenWidth = glslifyNumbers`${cfg.calibration.screenW.value}`;
  const screenHeight = glslifyNumbers`${cfg.calibration.screenH.value}`;
  const filterMode = `${Math.round(cfg.filterMode)}`;
  const gaussianSigma = glslifyNumbers`${cfg.gaussianSigma}`;

  return `#version 300 es
    precision mediump float;

    uniform int u_viewType;
    uniform sampler2D u_texture;
    in vec2 v_texcoord;

    const int MAX_SUBPIXELS = 60;
    uniform float subpixelData[MAX_SUBPIXELS];

    const int subpixelCellCount = ${subpixelCellCount};
    const int cellPatternType = ${cellPatternType};
    const int filter_mode = ${filterMode};
    const float gaussian_sigma = ${gaussianSigma};
    const float tileCount = ${tileCount};
    const float focus = 0.0;
    const float dpi = ${dpi};

    const vec2 quiltViewPortion = vec2(
      ${(Number(quiltWidth) * Number(tileWidth)) / Number(framebufferWidth)},
      ${(Number(quiltHeight) * Number(tileHeight)) / Number(framebufferHeight)});

    int GetCellForPixel(vec2 screen_uv)
    {
        int xPos = int(screen_uv.x * ${screenWidth});
        int yPos = int(screen_uv.y * ${screenHeight});
        int cell;
    
        if(cellPatternType == 0)
        {
            cell = 0;
        }
        else if(cellPatternType == 1)
        {
            if ((yPos % 2 == 0 && xPos % 2 == 0) || (yPos % 2 != 0 && xPos % 2 != 0)) {
                cell = 0;
            } else {
                cell = 1;
            }
        }
        else if(cellPatternType == 2)
        {
            cell = xPos % 2;
        }
        else if(cellPatternType == 3)
        {
            int offset = (xPos % 2) * 2;
            cell = ((yPos + offset) % 4);
        }
        else if(cellPatternType == 4)
        {
            cell = yPos % 2;
        }
    
        return cell % subpixelCellCount;
    }

    vec2 GetQuiltCoordinates(vec2 tile_uv, int viewIndex)
    {
        float totalTiles = tileCount;
        float floaty = float(viewIndex);
        float view = clamp(floaty, 0.0, totalTiles);
        float tx = ${tilesX} - 0.00001;
        float tileXIndex = mod(view, tx);
        float tileYIndex = floor(view / tx);
    
        float quiltCoordU = ((tileXIndex + tile_uv.x) / tx) * quiltViewPortion.x;
        float quiltCoordV = ((tileYIndex + tile_uv.y) / ${tilesY}) * quiltViewPortion.y;
    
        vec2 quilt_uv = vec2(quiltCoordU, quiltCoordV);
    
        return quilt_uv;
    }

    float GetPixelShift(float val, int subPixel, int axis, int cell)
    {
        int index = cell * 6 + subPixel * 2 + axis;
        float offset = subpixelData[index];

        return val + offset;
    }

    vec3 GetSubpixelViews(vec2 screen_uv) {
        vec3 views = vec3(0.0);

        if(subpixelCellCount <= 0)
        {
            if (dpi>330.0 && dpi<334.0)
            {
                if (${screenWidth}>${screenHeight})
                {
                    // DPI≈332 横屏 2x2 亚像素
                    int ypos = int(floor(mod(screen_uv.y * ${screenHeight} + 0.5, 2.0)));
                    int xpos = int(floor(mod(screen_uv.x * ${screenWidth} + 0.5, 2.0)));
                    vec2 roffset = vec2(0.257265, 1.229050);
                    vec2 goffset = vec2(0.746059, 0.432407);
                    vec2 boffset = vec2(1.043928, 0.601035);

                    roffset = vec2(-0.1, 0.22);
                    goffset = vec2(0.37, 0.09);
                    boffset = vec2(0.11, 0.45);

                    views[0] = screen_uv.x + roffset.x / ${screenWidth};
                    views[0] += screen_uv.y * ${slope};

                    views[1] = screen_uv.x + goffset.x / ${screenWidth};
                    views[1] += screen_uv.y * ${slope};

                    if (ypos == 0)
                    {
                        if (xpos == 0) {
                        views[2] = screen_uv.x + boffset.x / ${screenWidth};
                        views[2] += (screen_uv.y + roffset.y / ${screenHeight}) * ${slope};
                        }
                        else if (xpos == 1) {
                        views[2] = screen_uv.x + boffset.y / ${screenWidth};
                        views[2] += (screen_uv.y + goffset.y / ${screenHeight}) * ${slope};
                        }
                    }
                    else
                    {
                        if (xpos == 0) {
                        views[2] = screen_uv.x + boffset.y / ${screenWidth};
                        views[2] += (screen_uv.y + goffset.y / ${screenHeight}) * ${slope};
                        }
                        else if (xpos == 1) {
                        views[2] = screen_uv.x + boffset.x / ${screenWidth};
                        views[2] += (screen_uv.y + roffset.y / ${screenHeight}) * ${slope};
                        }
                    }
                }
                else
                {
                    // 8.4 寸竖屏（2160×3840）2x2 亚像素，已测试
                    int ypos = int(floor(mod(screen_uv.y * ${screenHeight} + 0.5, 2.0)));
                    int xpos = int(floor(mod(screen_uv.x * ${screenWidth} + 0.5, 2.0)));
                    vec2 roffset = vec2(0.257265, 1.229050);
                    vec2 goffset = vec2(0.746059, 0.432407);
                    vec2 boffset = vec2(1.043928, 0.601035);

                    roffset = vec2(0, 0);
                    goffset = vec2(-0.28, -0.51);
                    boffset = vec2(1.199999, 0.081);

                    if (ypos == 0)
                    {
                        if (xpos == 0) {
                            views[2] = (screen_uv.x + goffset.x / ${screenWidth} + (screen_uv.y + boffset.y / ${screenHeight}) * ${slope});
                        }
                        else if (xpos == 1) {
                            views[2] = (screen_uv.x + goffset.x / ${screenWidth} + (screen_uv.y + boffset.x / ${screenHeight}) * ${slope});
                        }
                    }
                    else
                    {
                        if (xpos == 0) {
                            views[2] = (screen_uv.x + goffset.x / ${screenWidth} + (screen_uv.y + boffset.x / ${screenHeight}) * ${slope});
                        }
                        else if (xpos == 1) {
                            views[2] = (screen_uv.x + goffset.x / ${screenWidth} + (screen_uv.y + boffset.y / ${screenHeight}) * ${slope});
                        }
                    }

                    views[1] = (screen_uv.x + roffset.x / ${screenWidth} + (screen_uv.y + goffset.y / ${screenHeight}) * ${slope}); 
                    views[0] = (screen_uv.x + roffset.x / ${screenWidth} + (screen_uv.y + roffset.y / ${screenHeight}) * ${slope});
                }
            }
            else if (dpi>358.0 && dpi<360.0)
            {
              // 13.3 寸竖屏，待实机验证
              vec2 roffset = vec2(0.05, 0.0);
              vec2 goffset = vec2(0.32, 0.0);
              vec2 boffset = vec2(0.01, 0.0);

              views[0] = (screen_uv.x - roffset.x * 3.0 * ${subp} + screen_uv.y * ${slope});
              views[1] = (screen_uv.x + goffset.x * 3.0 * ${subp} + screen_uv.y * ${slope});
              views[2] = (screen_uv.x + boffset.x * 3.0 * ${subp} + 2.0 * ${subp} + screen_uv.y * ${slope});
            }
            else{
              views[0] = screen_uv.x + ${subp} * 0.0;
              views[1] = screen_uv.x + ${subp} * 1.0;
              views[2] = screen_uv.x + ${subp} * 2.0;

              views[0] += screen_uv.y * ${slope};
              views[1] += screen_uv.y * ${slope};
              views[2] += screen_uv.y * ${slope};
            }
        } else {
            int cell = GetCellForPixel(screen_uv);

            views[0]  = GetPixelShift(screen_uv.x, 0, 0, cell);
            views[1]  = GetPixelShift(screen_uv.x, 1, 0, cell);
            views[2]  = GetPixelShift(screen_uv.x, 2, 0, cell);

            views[0] += GetPixelShift(screen_uv.y, 0, 1, cell) * ${slope};
            views[1] += GetPixelShift(screen_uv.y, 1, 1, cell) * ${slope};
            views[2] += GetPixelShift(screen_uv.y, 2, 1, cell) * ${slope};
        }

        views *= vec3(${pitch});
        views -= vec3(${center});
        views = vec3(1.0) - fract(views);

        views = clamp(views, vec3(0.00001), vec3(0.999999));
    
        return views;
    }
    
    vec4 GetViewsColors(vec2 tile_uv, vec3 views)
    {
        vec4 color = vec4(0, 0, 0, 1);
    
        for(int channel = 0; channel < 3; channel++)
        {
            int viewIndex = int(views[channel] * tileCount);
    
            float viewDir = views[channel] * 2.0 - 1.0;
            vec2 focused_uv = tile_uv;
            focused_uv.x += viewDir * focus;
    
            vec2 quilt_uv = GetQuiltCoordinates(focused_uv, viewIndex);
            color[channel] = texture(u_texture, quilt_uv)[channel];
        }
    
        return color;
    }

    vec4 OldViewFiltering(vec2 tile_uv, vec3 views)
    {
        vec3 viewIndicies = views * tileCount;
        float viewSpaceTileSize = 1.0 / tileCount;
    
        vec3 leftViews = views;
        vec3 rightViews = leftViews + viewSpaceTileSize;
    
        vec4 leftColor = GetViewsColors(tile_uv, leftViews);
        vec4 rightColor = GetViewsColors(tile_uv, rightViews);
    
        vec3 leftRightLerp = viewIndicies - floor(viewIndicies);
    
        return vec4(
            mix(leftColor.x, rightColor.x, leftRightLerp.x),
            mix(leftColor.y, rightColor.y, leftRightLerp.y),
            mix(leftColor.z, rightColor.z, leftRightLerp.z),
            1.0
        );
    }

    vec4 GaussianViewFiltering(vec2 tile_uv, vec3 views)
    {
        vec3 viewIndicies = views * tileCount;
        float viewSpaceTileSize = 1.0 / tileCount;
    
        vec3 centerViews = views;
        vec3 leftViews = centerViews - viewSpaceTileSize;
        vec3 rightViews = centerViews + viewSpaceTileSize;
    
        vec4 centerColor = GetViewsColors(tile_uv, centerViews);
        vec4 leftColor   = GetViewsColors(tile_uv, leftViews);
        vec4 rightColor  = GetViewsColors(tile_uv, rightViews);
    
        vec3 centerSnappedViews = floor(centerViews * tileCount) / tileCount;
        vec3 leftSnappedViews = floor(leftViews * tileCount) / tileCount;
        vec3 rightSnappedViews = floor(rightViews * tileCount) / tileCount;
    
        float sigma = gaussian_sigma;
        float multiplier = 2.0 * sigma * sigma;
    
        vec3 centerDiff = views - centerSnappedViews;
        vec3 leftDiff = views - leftSnappedViews;
        vec3 rightDiff = views - rightSnappedViews;
    
        vec3 centerWeight = exp(-centerDiff * centerDiff / multiplier);
        vec3 leftWeight = exp(-leftDiff * leftDiff / multiplier);
        vec3 rightWeight = exp(-rightDiff * rightDiff / multiplier);
    
        vec3 totalWeight = centerWeight + leftWeight + rightWeight;
        centerWeight /= totalWeight;
        leftWeight /= totalWeight;
        rightWeight /= totalWeight;
    
        vec4 outputColor = vec4(
            centerColor.r * centerWeight.x + leftColor.r * leftWeight.x + rightColor.r * rightWeight.x,
            centerColor.g * centerWeight.y + leftColor.g * leftWeight.y + rightColor.g * rightWeight.y,
            centerColor.b * centerWeight.z + leftColor.b * leftWeight.z + rightColor.b * rightWeight.z,
            1.0
        );
    
        return outputColor;
    }

    vec4 NGaussianViewFiltering(vec2 tile_uv, vec3 views, int n)
    {
        float viewSpaceTileSize = 1.0 / tileCount;
    
        float sigma = gaussian_sigma;
        float multiplier = 2.0 * sigma * sigma;
    
        vec4 outputColor = vec4(0.0);
    
        for(int i = -n; i <= n; i++)
        {
            float offset = float(i) * viewSpaceTileSize;
            vec3 offsetViews = views + offset;
    
            vec4 sampleColor = GetViewsColors(tile_uv, offsetViews);
    
            vec3 snappedViews = floor(offsetViews * tileCount) / tileCount;
    
            vec3 diff = views - snappedViews;
            vec3 weight = exp(-diff * diff / multiplier);
    
            outputColor.rgb += sampleColor.rgb * weight;
        }
        vec3 totalWeight = vec3(0.0);
        for(int i = -n; i <= n; i++)
        {
            float offset = float(i) * viewSpaceTileSize;
            vec3 offsetViews = views + offset;
    
            vec3 snappedViews = floor(offsetViews * tileCount) / tileCount;
    
            vec3 diff = views - snappedViews;
            vec3 weight = exp(-diff * diff / multiplier);
    
            totalWeight += weight;
        }
    
        outputColor.rgb /= totalWeight;
        outputColor.a = 1.0;
    
        return outputColor;
    }

    float remap(float value, float from1, float to1, float from2, float to2) {
      return (value - from1) / (to1 - from1) * (to2 - from2) + from2;
    }

    out vec4 color;

    void main() {
      if (u_viewType == 2) {
        color = texture(u_texture, v_texcoord);
        return;
      }
      if (u_viewType == 1) {
        color = texture(u_texture, GetQuiltCoordinates(v_texcoord.xy, ${Math.round(Number(tileCount) / 2)}));
        return;
      }

    vec3 views = GetSubpixelViews(v_texcoord);

    if(filter_mode == 0)
        {
            color = GetViewsColors(v_texcoord, views);
        }
        else if(filter_mode == 1)
        {
            color = OldViewFiltering(v_texcoord, views);
        }
        else if(filter_mode == 2)
        {
            color = GaussianViewFiltering(v_texcoord, views);
        }
        else if(filter_mode == 3)
        {
            color = NGaussianViewFiltering(v_texcoord, views, 10);
        }
    }
  `;
}
