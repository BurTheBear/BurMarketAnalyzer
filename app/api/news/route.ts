import { news } from '@/lib/news/feed';
export async function GET(){return Response.json(await news(),{headers:{'Cache-Control':'private, max-age=60'}});}
