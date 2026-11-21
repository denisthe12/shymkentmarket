INSERT INTO stores (id,code,name) VALUES ('store-a','STORE_A','Store A'),('store-b','STORE_B','Store B'),('store-c','STORE_C','Store C');
INSERT INTO categories (id,slug,name,"filterSchema") VALUES
('milk','milk','Молоко','{"filters":[{"key":"brand","label":"Brand","type":"multi-select","options":["A","B","stale"]},{"key":"volumeMl","label":"Volume","type":"multi-select","options":[500,1000,"1000",999]},{"key":"organic","label":"Organic","type":"boolean"},{"key":"stale","label":"Stale","type":"multi-select","options":[1]},{"key":"broken","label":"Broken","type":"multi-select"}]}'),
('oil','oil','Масло','{"filters":[]}'),('empty','empty','Empty',NULL);
INSERT INTO store_locations(id,"storeId",name,address,latitude,longitude) VALUES
('loc-store-a','store-a','Fixture Store A','Synthetic fixture address',43.6,51.1),
('loc-store-b','store-b','Fixture Store B','Synthetic fixture address',43.7,51.2);
INSERT INTO snapshots(id,status,"publishedAt","sourceStats") VALUES ('fixture-internal-v1','published','2026-10-05 11:00:00','{"fixture":true}');
INSERT INTO source_runs(id,"snapshotId","storeId",status,"capturedAt","productCount") VALUES
('fixture-store-a','fixture-internal-v1','store-a','succeeded','2026-10-05 11:00:00',1),
('fixture-store-b','fixture-internal-v1','store-b','succeeded','2026-10-04 11:00:00',1),
('fixture-store-c','fixture-internal-v1','store-c','succeeded','2026-10-04 11:00:00',1);
INSERT INTO raw_products (id,"storeId","sourceProductId","rawName","rawPrice","snapshotId") VALUES
('r1','store-a','1','Fixture',100,'fixture-internal-v1'),('r2','store-b','2','Fixture',200,'fixture-internal-v1'),('r3','store-c','3','Fixture',300,'fixture-internal-v1');
INSERT INTO canonical_products (id,name,brand,"categoryId",attributes) VALUES
('p1','Молоко Альфа','A','milk','{"volumeMl":1000,"organic":true,"nested":{},"nil":null}'),
('p2','МОЛОКО Бета','B','milk','{"volumeMl":500,"organic":false}'),
('p3','Молоко Ёж','A','milk','{"volumeMl":"1000","organic":true}'),
('p4','Масло подсолнечное','A','oil','{"volumeMl":1000}'),
('zero','Нулевая цена','A','milk','{"volumeMl":999}'),
('out','Нет в наличии','stale','milk','{"volumeMl":999}'),
('none','Нет offers','A','milk','{"volumeMl":999}');
INSERT INTO offers (id,"canonicalProductId","rawProductId","storeId",price,"oldPrice","inStock","snapshotAt","snapshotId") VALUES
('o1','p1','r1','store-a',120,150,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o2','p1','r2','store-b',100,NULL,true,'2026-10-02 11:00:00','fixture-internal-v1'),
('o3','p1','r3','store-c',0,NULL,true,'2026-10-04 11:00:00','fixture-internal-v1'),
('o4','p1','r1','store-a',1,NULL,false,'2026-10-05 11:00:00','fixture-internal-v1'),
('o5','p2','r1','store-a',100,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o6','p3','r2','store-b',200,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o7','p4','r3','store-c',50,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o8','zero','r1','store-a',0,NULL,true,'2026-10-01 10:00:00','fixture-internal-v1'),
('o9','out','r2','store-b',80,NULL,false,'2026-10-01 10:00:00','fixture-internal-v1');
