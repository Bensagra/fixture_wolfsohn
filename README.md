# Mundial Or Hanoar

Fixture mobile-first para administrar un torneo en formato liga o eliminación directa.

## Desarrollo

```bash
npm install
npm run dev
```

El panel administrador usa el PIN `1313` mientras no se configure `VITE_ADMIN_PIN`.

## Supabase

1. Crear un proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en el SQL Editor.
3. En Authentication > Users, crear el usuario administrador con email y contraseña.
4. Copiar `.env.example` a `.env` y completar la URL y anon key.
5. Reiniciar el servidor.

Sin Supabase, la aplicación guarda automáticamente todo en `localStorage`.

La tabla es visible públicamente para que todos puedan consultar el fixture, pero solo
un usuario autenticado puede modificarla desde el panel administrador.
