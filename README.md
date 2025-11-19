# hh-apply
Automation of job application in hh.ru

## Video demonstration

https://github.com/user-attachments/assets/6884b2fe-e322-4358-aab8-7f3c20ccdc46

## Application message example

```
В какой форме предлагается юридическое оформление удалённой работы?

Посмотреть мой код на GitHub можно тут:

github.com/konard
github.com/deep-assistant
github.com/linksplatform
github.com/link-foundation
```

## Run

**Note:** It's recommended to use `--verbose` flag for debugging to see detailed logs about which buttons are being clicked and which textareas are being detected.

The application now supports both Playwright and Puppeteer through a single unified command. Use the `--engine` flag to choose between them (default: playwright).

### Using Playwright (default)

Using npm script (with verbose logging for debugging):
```bash
npm run puppeteer -- --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

Or explicitly specify Playwright:
```bash
npm run playwright -- --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

With custom message:

```bash
npm run apply -- --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --message "Your custom application message here" --verbose
```

Direct execution:
```bash
./src/apply.mjs --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

Using globally installed CLI (after `npm install -g`):
```bash
hh-apply --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

### Using Puppeteer

Using npm script (with verbose logging for debugging):
```bash
npm run puppeteer -- --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

With custom message:

```bash
npm run apply -- --engine puppeteer --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --message "Your custom application message here" --verbose
```

Direct execution:
```bash
./src/apply.mjs --engine puppeteer --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```

Using globally installed CLI (after `npm install -g`):
```bash
hh-apply --engine puppeteer --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 7 --verbose
```
