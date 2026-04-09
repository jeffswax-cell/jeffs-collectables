const API_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const OWNER = '1.prg.wam';
const PAGE_SIZE = 100;
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

function normalizeIpfsUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('Qm') || raw.startsWith('bafy')) return IPFS_GATEWAY + raw;
  return null;
}

function normalizeAsset(asset) {
  const data = asset.data || {};
  const template = asset.template || {};
  const templateData = template.immutable_data || {};
  const collection = asset.collection || {};

  // Prioritize static image, then fall back to video
  const imgRaw = data.img || data.image || templateData.img || templateData.image || null;
  const videoRaw = data.video || templateData.video || null;
  const backImgRaw = data.backimg || templateData.backimg || null;

  // Determine the best media URL and its type
  let mediaUrl = null;
  let mediaType = 'image'; // 'image' or 'video'

  if (imgRaw) {
    mediaUrl = normalizeIpfsUrl(imgRaw);
    mediaType = 'image';
  } else if (videoRaw) {
    mediaUrl = normalizeIpfsUrl(videoRaw);
    mediaType = 'video';
  }

  return {
    asset_id: asset.asset_id,
    name: asset.name || data.name || templateData.name || 'Unnamed',
    collection_name: collection.collection_name || '',
    collection_display: collection.name || collection.collection_name || '',
    template_id: template.template_id || null,
    media_url: mediaUrl,
    media_type: mediaType,
    back_image_url: normalizeIpfsUrl(backImgRaw),
    // Keep image_url for backwards compat with frontend filtering
    image_url: mediaUrl,
    schema_name: asset.schema ? asset.schema.schema_name : '',
    mint_number: asset.template_mint || null,
    rarity: data.rarity || templateData.rarity || null,
    variant: data.variant || templateData.variant || null,
  };
}

async function fetchAllAssets(collectionName) {
  const allAssets = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${API_BASE}/assets?owner=${OWNER}&collection_name=${collectionName}&limit=${PAGE_SIZE}&page=${page}&order=desc&sort=asset_id`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`AtomicAssets API returned ${response.status}`);
    }

    const json = await response.json();

    if (!json.success || !Array.isArray(json.data)) {
      throw new Error('Unexpected API response format');
    }

    allAssets.push(...json.data);
    hasMore = json.data.length === PAGE_SIZE;
    page++;

    if (page > 50) break; // safety limit
  }

  return allAssets;
}

async function fetchCollections() {
  const url = `${API_BASE}/accounts/${OWNER}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`AtomicAssets API returned ${response.status}`);
  }

  const json = await response.json();

  if (!json.success || !json.data) {
    throw new Error('Unexpected API response format');
  }

  const collections = (json.data.collections || []).map(c => ({
    collection_name: c.collection.collection_name,
    display_name: c.collection.name || c.collection.collection_name,
    count: parseInt(c.assets, 10) || 0,
  }));

  collections.sort((a, b) => b.count - a.count);

  return {
    total_assets: collections.reduce((sum, c) => sum + c.count, 0),
    collections,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { collection } = req.query;

  try {
    if (!collection) {
      const data = await fetchCollections();
      return res.status(200).json({
        success: true,
        owner: OWNER,
        ...data,
      });
    }

    const rawAssets = await fetchAllAssets(collection);
    const normalized = rawAssets.map(normalizeAsset);

    return res.status(200).json({
      success: true,
      owner: OWNER,
      collection: collection,
      count: normalized.length,
      assets: normalized,
    });
  } catch (err) {
    console.error('WAX API error:', err.message);
    return res.status(502).json({
      success: false,
      error: 'Unable to fetch wallet data. Please try again later.',
      detail: err.message,
    });
  }
};
