import { checkAllLinks } from "../services/linkChecker";

checkAllLinks()
  .then((result) => {
    // eslint-disable-next-line no-console
    console.log(`تم فحص ${result.checked} رابط — يعمل: ${result.active} — تالف: ${result.broken}`);
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
