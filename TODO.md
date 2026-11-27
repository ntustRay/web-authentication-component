# TODO

- [ ] 變更 adapter 或公開型別後，補齊對應的 SDK 型別 fixture、行為測試和 dist smoke test。[驗證範圍](docs/VERIFICATION.md)
- [ ] 準備下次套件發布時，先跑 `bun audit`、`bun run verify` 及 package dry run。核對 export 與宣告檔，並用全新 consumer 驗證實際發布的版本。[發布流程](docs/PUBLISHING.md)
