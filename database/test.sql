INSERT INTO url_data (config_id, url, name, duration, max_num) VALUES
                                                                   (1, 'https://t.me/baolidb', '保利担保', 30, 3),
                                                                   (1, 'https://t.me/zhonghua2014tianxiang', '中华天象', 30, 3),
                                                                   (1, 'https://t.me/lianheshequ424', '联合社区', 30, 3),
                                                                   (1, 'https://t.me/make_friends1', 'make_friends', 30, 3)
ON CONFLICT DO NOTHING;