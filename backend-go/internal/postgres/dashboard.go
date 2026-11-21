package postgres

import (
	"adilbaga/backend-go/internal/dashboard"
	"context"
	"encoding/json"
)

var _ dashboard.Repository = (*Repository)(nil)

// One roundtrip, final aggregates only. No Product DTO hydration or N+1.
// A store is visible only when the current snapshot has an offer for it: the API role cannot read source_runs,
// and a store row without data (before the first publish, after a rollback) must not show an empty basket.
const dashboardSQL = `WITH current_snapshot AS (
 SELECT id FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC,id DESC LIMIT 1
), visible_stores AS (
 SELECT s.id,s.code,s.name,s."sortOrder" FROM public.stores s WHERE EXISTS (
 SELECT 1 FROM public.offers o WHERE o."snapshotId"=(SELECT id FROM current_snapshot) AND o."storeId"=s.id)
), usable AS MATERIALIZED (
 SELECT p.id,p.name,p."categoryId",p.attributes,o."storeId",o.price,o."snapshotAt"
 FROM public.canonical_products p JOIN public.offers o ON o."canonicalProductId"=p.id
 WHERE o."snapshotId"=(SELECT id FROM current_snapshot) AND o."inStock" AND o.price>0
), aggregates AS (
 SELECT id,name,min(price) min_price,max(price) max_price,
 count(DISTINCT "storeId") chains,max("snapshotAt") snapshot_at
 FROM usable GROUP BY id,name
), spreads AS (
 SELECT id,name,min_price,max_price,
 floor(((max_price-min_price)::float8/min_price)*10000+0.5)/100 difference
 FROM aggregates WHERE chains>=2
), slots(ord,slug,name,category,key,lo,hi,pattern) AS (
 VALUES (1,'basket-milk','Молоко 1 л','milk','volumeMl',1000,1000,'^молоко '),
 (2,'basket-pasta','Макароны 400 г','groats','weightGrams',400,400,'^(макароны|спагетти)'),
 (3,'basket-rice','Рис 800 г','groats','weightGrams',800,800,'^рис '),
 (4,'basket-yogurt','Йогурт Fruttis 115 г','dairy','weightGrams',115,115,'fruttis'),
 (5,'basket-noodles','Лапша Доширак 120 г','groats','weightGrams',120,120,'доширак')
), candidates AS (
 SELECT u."storeId",slots.ord,u.id,u.name,u.price,
 row_number() OVER (PARTITION BY u."storeId",slots.ord ORDER BY u.price,u.id COLLATE "C") choice
 FROM usable u JOIN public.categories c ON c.id=u."categoryId"
 JOIN slots ON slots.category=c.slug
 AND CASE WHEN jsonb_typeof(u.attributes->slots.key)='number'
 THEN (u.attributes->>slots.key)::numeric END BETWEEN slots.lo AND slots.hi
 AND u.name ~* slots.pattern
), baskets AS (
 SELECT s.code,s.name,s."sortOrder",sum(coalesce(best.price,0)) total,
 jsonb_agg(jsonb_build_object('categorySlug',slots.slug,'categoryName',slots.name,
 'productId',best.id,'name',best.name,'price',best.price) ORDER BY slots.ord) items
 FROM visible_stores s CROSS JOIN slots
 LEFT JOIN candidates best ON best."storeId"=s.id AND best.ord=slots.ord AND best.choice=1
 GROUP BY s.id,s.code,s.name,s."sortOrder"
)
SELECT jsonb_build_object(
 'summary',jsonb_build_object('canonicalProducts',(SELECT count(*) FROM aggregates),
 'stores',(SELECT count(*) FROM visible_stores),
 'matchedAcrossStores',(SELECT count(*) FROM spreads),
 'snapshotAt',coalesce((SELECT to_char(max(snapshot_at),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM aggregates),'')),
 'priceSpreads',coalesce((SELECT jsonb_agg(jsonb_build_object('productId',id,'name',name,
 'minPrice',min_price,'maxPrice',max_price,'differencePercent',difference)
 ORDER BY difference DESC,id COLLATE "ru-x-icu") FROM spreads),'[]'::jsonb),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('storeCode',s.code,'storeName',s.name,
 'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude)
 ORDER BY s.code,l.name,l.id) FROM public.store_locations l JOIN visible_stores s ON s.id=l."storeId"),'[]'::jsonb),
 'baskets',coalesce((SELECT jsonb_agg(jsonb_build_object('storeCode',code,'storeName',name,'total',total,'items',items)
 ORDER BY "sortOrder",code COLLATE "C")
 FROM baskets),'[]'::jsonb)) FROM current_snapshot`

func (r *Repository) GetDashboard(ctx context.Context) (dashboard.Dashboard, error) {
	var result dashboard.Dashboard
	var raw []byte
	if err := r.db.QueryRow(ctx, dashboardSQL).Scan(&raw); err != nil {
		return result, databaseError(err)
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return result, databaseError(err)
	}
	return result, nil
}
