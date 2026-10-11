import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 const password=process.env.KEYCLOAK_DB_PASSWORD;
 if(!/^[a-f0-9]{48,128}$/.test(password||''))throw new Error('Use a generated hex KEYCLOAK_DB_PASSWORD');
 if(!(await pool.query("SELECT 1 FROM pg_roles WHERE rolname='keycloak'")).rowCount){
  const q=await pool.query("SELECT format('CREATE ROLE keycloak LOGIN PASSWORD %L',$1::text) AS sql",[password]);await pool.query(q.rows[0].sql);
 }
 if(!(await pool.query("SELECT 1 FROM pg_database WHERE datname='keycloak'")).rowCount)await pool.query('CREATE DATABASE keycloak OWNER keycloak');
 console.log('Keycloak database ready');
}finally{await pool.end();}
