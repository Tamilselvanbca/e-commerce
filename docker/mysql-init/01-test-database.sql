-- Runs once when the MySQL container is first created: a separate database for `npm test`.
CREATE DATABASE IF NOT EXISTS shop_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON shop_test.* TO 'shop'@'%';
FLUSH PRIVILEGES;
