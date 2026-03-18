# עדכון תוכנה מרחוק – הוראות

## הגדרה ראשונית

1. **צור ריפו ב-GitHub** (אם עדיין לא קיים):
   ```bash
   # ב-GitHub: New repository → natan
   git remote add origin https://github.com/YOUR_USERNAME/natan.git
   ```

2. **עדכן את כתובת הריפו** ב-`package.json`:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/YOUR_USERNAME/natan.git"
   }
   ```

3. **העלה את הקוד**:
   ```bash
   git add .
   git commit -m "Add auto-update"
   git push -u origin main
   ```

## שחרור גרסה חדשה (עדכון מרחוק)

בכל פעם שרוצים לפרסם עדכון:

1. **עדכן גרסה** ב-`package.json`:
   ```json
   "version": "0.1.1"
   ```

2. **צור תג והעלה**:
   ```bash
   git add package.json
   git commit -m "Bump to v0.1.1"
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   ```

3. **GitHub Actions** ירוץ אוטומטית, יבנה את האפליקציה ל-Windows ויפרסם ל-Releases.

4. **משתמשים** שפתחו את האפליקציה יקבלו הודעה על עדכון זמין ויוכלו להוריד ולהתקין בלחיצה.

## בנייה ידנית (ללא פרסום)

```bash
npm run electron:dist
```

הפלט יהיה ב-`dist-electron/win-unpacked/`.
