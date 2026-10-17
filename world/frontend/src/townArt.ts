import mapData from './maps/night-town.json';

export const TOWN_ATLAS = '/assets/kenney-tiny-town/tilemap_packed.png';
export const CHARACTER_ATLAS = '/assets/kenney-tiny-dungeon/tilemap_packed.png';
export const characterTiles: Record<string, number> = { player: 85, mayor: 86, caretaker: 87, shopkeeper: 99, reporter: 98 };
export const ART_CREDIT = 'Kenney Tiny Town / Tiny Dungeon · CC0';
let assets: Promise<{ town: HTMLImageElement; dungeon: HTMLImageElement }> | undefined;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法加载本地像素素材'));
    image.src = url;
  });
}

export function loadTownArt() {
  if (!assets) assets = Promise.all([loadImage(TOWN_ATLAS), loadImage(CHARACTER_ATLAS)]).then(([town, dungeon]) => ({ town, dungeon })).catch(error => { assets = undefined; throw error; });
  return assets;
}

export function drawTileTown(ctx: CanvasRenderingContext2D, images: { town: HTMLImageElement; dungeon: HTMLImageElement }, gateOpen = false) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, mapData.width * mapData.tilewidth, mapData.height * mapData.tileheight);
  const tile = (gid: number, x: number, y: number, width = 16, height = 16) => {
    const dungeon = gid >= 1001, index = gid - (dungeon ? 1001 : 1);
    ctx.drawImage(dungeon ? images.dungeon : images.town, (index % 12) * 16, Math.floor(index / 12) * 16, 16, 16,
      Math.round(x), Math.round(y), width, height);
  };
  for (const layer of mapData.layers) {
    if (!layer.visible) continue;
    if (layer.type === 'tilelayer' && 'data' in layer) {
      ctx.save();
      const clip = layer.properties?.find(property => property.name === 'clipRect');
      if (clip) { const [x, y, w, h] = JSON.parse(clip.value); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }
      layer.data?.forEach((gid, index) => {
        if (gid) tile(gid, (index % mapData.width) * 16 + (layer.offsetx || 0), Math.floor(index / mapData.width) * 16 + (layer.offsety || 0));
      });
      ctx.restore();
    } else if (layer.type === 'objectgroup' && 'objects' in layer) {
      for (const object of layer.objects || []) {
        if (gateOpen && object.name === 'South gate') continue;
        if ('gid' in object && object.gid) tile(object.gid, object.x, object.y - (object.height || 16), object.width || 16, object.height || 16);
      }
    }
  }
}
